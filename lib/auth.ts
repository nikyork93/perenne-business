import { cookies, headers } from 'next/headers';
import { prisma } from './prisma';
import { generateToken } from './crypto';
import type { User, UserRole } from '@prisma/client';

/** Cookie name for the session token */
export const SESSION_COOKIE = 'perenne_session';
/** 30 days in ms */
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Public session shape returned to pages/components.
 * Never exposes the raw token or hashed fields.
 */
export interface SessionData {
  userId: string;
  email: string;
  name: string | null;
  role: UserRole;
  companyId: string | null;
}

/**
 * Create a session for a user, write cookie, return session.
 * Invalidates any previous sessions for this user (single active session).
 */
export async function createSession(user: User): Promise<SessionData> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  // Invalidate prior sessions for this user (single active session = more secure)
  await prisma.session.deleteMany({ where: { userId: user.id } });

  // Read request metadata for audit
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ipAddress = h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    userAgent = h.get('user-agent');
  } catch {
    // headers() may not be available in some contexts
  }

  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      ipAddress,
      userAgent,
      expiresAt,
    },
  });

  // Write httpOnly secure cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });

  // Update lastLoginAt
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
  };
}

/**
 * Read the current session from the cookie.
 * Returns null if no cookie, token invalid, or session expired.
 * Auto-deletes expired sessions.
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;

  // Expired? Clean up and bail
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
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

/**
 * Destroy the current session (logout).
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => null);
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Helper for page components — redirect to /login if no session.
 * Throws `redirect` (Next.js API) so callers don't need to handle it.
 */
export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session) {
    // Dynamic import to avoid SSR circular issues
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }
  return session;
}

/**
 * Require a specific role (or higher privilege).
 * SUPERADMIN > OWNER > ADMIN > VIEWER
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  VIEWER: 1,
  ADMIN: 2,
  OWNER: 3,
  SUPERADMIN: 100,
};

export async function requireRole(minRole: UserRole): Promise<SessionData> {
  const session = await requireSession();
  if (ROLE_HIERARCHY[session.role] < ROLE_HIERARCHY[minRole]) {
    const { notFound } = await import('next/navigation');
    notFound(); // 404 instead of 403 to avoid leaking admin routes exist
  }
  return session;
}
