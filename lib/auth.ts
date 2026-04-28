import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import type { UserRole } from '@prisma/client';

export const SESSION_COOKIE = 'perenne_session';
const SESSION_DURATION_DAYS = 30;
const MAGIC_LINK_DURATION_MINUTES = 15;

export interface Session {
  userId: string;
  email: string;
  name: string | null;
  role: UserRole;
  companyId: string | null;
}

// ─── Token gen ─────────────────────────────────────────────────────

function generateRandomToken(): string {
  return randomBytes(32).toString('base64url');
}

// ─── Magic link ────────────────────────────────────────────────────

/**
 * Creates a magic link for the given email.
 * Returns the FULL URL to email to the user.
 */
export async function createMagicLink(email: string): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();
  const token = generateRandomToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_DURATION_MINUTES * 60 * 1000);

  // Find or create user
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
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  return `${env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`;
}

/**
 * Consumes a magic link token, returning the user info if valid.
 * Does NOT create a session (call createSession separately).
 */
export async function consumeMagicLink(token: string): Promise<{
  userId: string;
  email: string;
  name: string | null;
  role: UserRole;
  companyId: string | null;
} | null> {
  const magicLink = await prisma.magicLink.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!magicLink) return null;
  if (magicLink.usedAt) return null;
  if (magicLink.expiresAt < new Date()) return null;

  // Mark as used
  await prisma.magicLink.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() },
  });

  // Update lastLoginAt
  await prisma.user.update({
    where: { id: magicLink.user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    userId: magicLink.user.id,
    email: magicLink.user.email,
    name: magicLink.user.name,
    role: magicLink.user.role,
    companyId: magicLink.user.companyId,
  };
}

// ─── Session ───────────────────────────────────────────────────────

/**
 * Creates a session for a user and sets the cookie.
 * Returns the session ID (also the cookie value).
 */
export async function createSession(userId: string): Promise<string> {
  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  });

  return session.id;
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie?.value) return null;

  const session = await prisma.session.findUnique({
    where: { id: cookie.value },
    include: { user: true },
  });

  if (!session) return null;
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
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

/**
 * Requires a session AND a specific role (or higher).
 * Redirects to /login if not auth, /dashboard if not authorized.
 */
export async function requireRole(allowedRoles: UserRole | UserRole[]): Promise<Session> {
  const session = await requireSession();
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.includes(session.role)) {
    redirect('/dashboard');
  }
  return session;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);

  if (cookie?.value) {
    await prisma.session.delete({ where: { id: cookie.value } }).catch(() => {});
  }

  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
