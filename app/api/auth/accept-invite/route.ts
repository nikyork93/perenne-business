import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const SESSION_COOKIE = 'perenne_session';
const SESSION_DURATION_DAYS = 90;

function generateRandomToken(): string {
  return randomBytes(32).toString('base64url');
}

// GET — validate token and return user info to pre-fill the form
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { inviteToken: token },
    include: { company: { select: { name: true } } },
  });

  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 });
  }

  if (user.inviteAcceptedAt) {
    return NextResponse.json(
      { error: 'This invite has already been used. Please sign in normally.', alreadyAccepted: true },
      { status: 400 }
    );
  }

  return NextResponse.json({
    valid: true,
    email: user.email,
    name: user.name,
    companyName: user.company?.name ?? null,
  });
}

// POST — set password, accept invite, auto-login
export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { token, password, name } = body;

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { inviteToken: token } });

  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 });
  }

  if (user.inviteAcceptedAt) {
    return NextResponse.json({ error: 'Invite already accepted' }, { status: 400 });
  }

  // Hash password and finalize
  const passwordHash = await hashPassword(password);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      name: name?.trim() || user.name,
      inviteToken: null, // invalidate
      inviteAcceptedAt: new Date(),
      lastLoginAt: new Date(),
    },
  });

  // Auto-login: create session + set cookie
  const sessionToken = generateRandomToken();
  await prisma.session.create({
    data: {
      userId: updated.id,
      token: sessionToken,
      expiresAt: new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  let destination = '/dashboard';
  if (updated.role === 'SUPERADMIN' && !updated.companyId) {
    destination = '/admin/companies';
  } else if (!updated.companyId) {
    destination = '/onboarding';
  }

  const response = NextResponse.json({
    success: true,
    destination,
    user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role },
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
