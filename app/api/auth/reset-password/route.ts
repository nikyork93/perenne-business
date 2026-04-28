import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET — validate reset token
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { resetPasswordToken: token },
    select: { id: true, email: true, name: true, resetPasswordExpiresAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 });
  }

  if (!user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    return NextResponse.json({ error: 'Token expired' }, { status: 410 });
  }

  return NextResponse.json({ valid: true, email: user.email, name: user.name });
}

// POST — set new password
export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { token, password } = body;

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { resetPasswordToken: token } });
  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 });
  }

  if (!user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    return NextResponse.json({ error: 'Token expired' }, { status: 410 });
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpiresAt: null,
      // If user was invited but never accepted, accept now (they've set a password via reset)
      inviteAcceptedAt: user.inviteAcceptedAt ?? new Date(),
      inviteToken: null,
    },
  });

  // Invalidate ALL existing sessions for this user — security
  await prisma.session.deleteMany({ where: { userId: user.id } });

  return NextResponse.json({ success: true });
}
