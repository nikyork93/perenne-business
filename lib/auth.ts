import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes, createHmac } from 'crypto';
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

// ─── Token generation ──────────────────────────────────────────────

function generateRandomToken(): string {
  return randomBytes(32).toString('base64url');
}

function signSessionToken(sessionId: string): string {
  const hmac = createHmac('sha256', env.AUTH_SECRET);
  hmac.update(sessionId);
  const signature = hmac.digest('base64url');
  return `${sessionId}.${signature}`;
}

function verifySessionToken(token: string): string | null {
  const [sessionId, signature] = token.split('.');
  if (!sessionId || !signature) return null;

  const expectedHmac = createHmac('sha256', env.AUTH_SECRET);
  expectedHmac.update(sessionId);
  const expectedSignature = expectedHmac.digest('base64url');

  if (signature !== expectedSignature) return null;
  return sessionId;
}

// ─── Magic link ────────────────────────────────────────────────────

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

export async function consumeMagicLink(token: string): Promise<Session | null> {
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

  // Create session
  const session = await prisma.session.create({
    data: {
      userId: magicLink.user.id,
      expiresAt: new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  // Set cookie
  const signedToken = signSessionToken(session.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
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

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie?.value) return null;

  const sessionId = verifySessionToken(cookie.value);
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
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

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);

  if (cookie?.value) {
    const sessionId = verifySessionToken(cookie.value);
    if (sessionId) {
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    }
  }

  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
