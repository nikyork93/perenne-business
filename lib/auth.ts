import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import type { UserRole } from '@prisma/client';

export const SESSION_COOKIE = 'perenne_session';
const SESSION_DURATION_DAYS = 90;
const RESET_PASSWORD_DURATION_MINUTES = 60;
const INVITE_DURATION_DAYS = 7;

export interface Session {
  userId: string;
  email: string;
  name: string | null;
  role: UserRole;
  companyId: string | null;
}

// ─── Token generation ──────────────────────────────────────────────

function generateRandomToken(): string {
  return randomBytes(32).toString('base64url');
}

// ─── Password hashing (bcrypt) ─────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

// ─── Invite tokens ─────────────────────────────────────────────────

/**
 * Creates a fresh invite token for a user (used when admin invites someone).
 * Returns the URL to send via email.
 */
export async function createInviteToken(userId: string): Promise<string> {
  const token = generateRandomToken();

  await prisma.user.update({
    where: { id: userId },
    data: {
      inviteToken: token,
      invitedAt: new Date(),
    },
  });

  return `${env.NEXT_PUBLIC_APP_URL}/invite?token=${token}`;
}

// ─── Password reset tokens ─────────────────────────────────────────

export async function createResetPasswordToken(email: string): Promise<string | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.isActive) return null;

  const token = generateRandomToken();
  const expiresAt = new Date(Date.now() + RESET_PASSWORD_DURATION_MINUTES * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: token,
      resetPasswordExpiresAt: expiresAt,
    },
  });

  return `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
}

// ─── Session management ────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  const sessionToken = generateRandomToken();

  await prisma.session.create({
    data: {
      userId,
      token: sessionToken,
      expiresAt: new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  });

  return sessionToken;
}

export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE);
    if (!cookie?.value) return null;

    const session = await prisma.session.findFirst({
      where: { token: cookie.value },
      include: { user: true },
    });

    if (!session) return null;
    if (!session.user.isActive) return null;
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      companyId: session.user.companyId,
    };
  } catch (err) {
    console.error('[getSession] Error:', err);
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export async function requireRole(allowedRoles: UserRole | UserRole[]): Promise<Session> {
  const session = await requireSession();
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.includes(session.role)) redirect('/dashboard');
  return session;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);

  if (cookie?.value) {
    await prisma.session.deleteMany({ where: { token: cookie.value } }).catch(() => {});
  }

  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

// ─── Legacy magic link (kept for backward compat — not used in new flow) ───

export async function createMagicLink(email: string): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();
  const token = generateRandomToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    const isSuperadmin = normalizedEmail === env.SUPERADMIN_EMAIL.toLowerCase();
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        role: isSuperadmin ? 'SUPERADMIN' : 'OWNER',
      },
    });
  }

  await prisma.magicLink.create({
    data: { token, userId: user.id, expiresAt },
  });

  return `${env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`;
}

export async function consumeMagicLink(token: string) {
  const magicLink = await prisma.magicLink.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!magicLink) return null;
  if (magicLink.usedAt) return null;
  if (magicLink.expiresAt < new Date()) return null;

  await prisma.magicLink.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() },
  });

  await prisma.user
    .update({
      where: { id: magicLink.user.id },
      data: { lastLoginAt: new Date() },
    })
    .catch(() => {});

  return {
    userId: magicLink.user.id,
    email: magicLink.user.email,
    name: magicLink.user.name,
    role: magicLink.user.role,
    companyId: magicLink.user.companyId,
  };
}

// Compat export for code that uses INVITE_DURATION_DAYS
export { INVITE_DURATION_DAYS };
