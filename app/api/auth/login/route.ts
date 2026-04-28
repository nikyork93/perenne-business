import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { verifyPassword } from '@/lib/auth';
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

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Generic error for both "user not found" and "wrong password" — security
  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 }
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      { error: 'This account has been disabled. Contact your administrator.' },
      { status: 403 }
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 }
    );
  }

  // Create session in DB
  const sessionToken = generateRandomToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt: new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  // Update lastLoginAt
  await prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch(() => {});

  // Smart redirect destination
  let destination = '/dashboard';
  if (user.role === 'SUPERADMIN' && !user.companyId) {
    destination = '/admin/companies';
  } else if (!user.companyId) {
    destination = '/onboarding';
  }

  // Build response with cookie set DIRECTLY (NEXT.JS 15 quirk)
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
