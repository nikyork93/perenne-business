import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { verifyPassword } from '@/lib/auth';
import { checkLoginRateLimit, recordLoginAttempt, extractIpAddress } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';

const SESSION_COOKIE = 'perenne_session';
const SESSION_DURATION_DAYS = 90;

function generateRandomToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const email = body.email?.toLowerCase().trim();
  const password = body.password;
  const ipAddress = extractIpAddress(req);
  const userAgent = req.headers.get('user-agent');

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  // Pre-flight rate limit check
  const rateCheck = await checkLoginRateLimit(email, ipAddress);
  if (!rateCheck.allowed) {
    if (rateCheck.reason === 'account_locked') {
      return NextResponse.json(
        {
          error: 'This account has been locked due to too many failed attempts. Reset your password to regain access.',
          locked: true,
        },
        { status: 423 }
      );
    }
    return NextResponse.json(
      {
        error: `Too many failed attempts. Please wait ${rateCheck.retryAfterMinutes ?? 30} minutes before trying again.`,
        retryAfterMinutes: rateCheck.retryAfterMinutes ?? 30,
      },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Generic error for both "user not found" and "wrong password"
  if (!user || !user.passwordHash) {
    await recordLoginAttempt({ email, ipAddress, userAgent, success: false });
    // Add small delay to prevent timing attacks
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 200));
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  if (!user.isActive) {
    return NextResponse.json(
      {
        error: 'This account has been disabled. Reset your password to reactivate, or contact your administrator.',
        locked: true,
      },
      { status: 403 }
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordLoginAttempt({ email, ipAddress, userAgent, success: false });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  // Success — record + create session
  await recordLoginAttempt({ email, ipAddress, userAgent, success: true });

  const sessionToken = generateRandomToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch(() => {});

  let destination = '/dashboard';
  if (user.role === 'SUPERADMIN' && !user.companyId) {
    destination = '/admin/companies';
  } else if (!user.companyId) {
    destination = '/onboarding';
  }

  const response = NextResponse.json({
    success: true,
    destination,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  });

  return response;
}
