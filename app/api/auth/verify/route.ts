import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { consumeMagicLink } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const SESSION_COOKIE = 'perenne_session';
const SESSION_DURATION_DAYS = 30;

function generateRandomToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * GET /api/auth/verify?token=...
 *
 * IMPORTANT: in Next.js 15 Route Handlers, cookies().set() does NOT
 * apply to NextResponse.redirect() responses. We must set the cookie
 * DIRECTLY on the response object via response.cookies.set(...).
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`);
  }

  console.log('[verify] start, token:', token.slice(0, 10) + '...');

  // Step 1: consume magic link → get user info (no cookie set yet)
  let userInfo;
  try {
    userInfo = await consumeMagicLink(token);
    console.log('[verify] consume OK:', userInfo ? userInfo.email : 'null');
  } catch (err) {
    console.error('[verify] consume threw:', err);
    return NextResponse.redirect(
      `${origin}/login?error=consume_failed&detail=${encodeURIComponent(
        err instanceof Error ? err.message.slice(0, 200) : 'unknown'
      )}`
    );
  }

  if (!userInfo) {
    return NextResponse.redirect(`${origin}/login?error=invalid_or_expired`);
  }

  // Step 2: create session in DB (no cookie API here, just DB write)
  const sessionToken = generateRandomToken();
  try {
    await prisma.session.create({
      data: {
        userId: userInfo.userId,
        token: sessionToken,
        expiresAt: new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    console.log('[verify] session created in DB for user:', userInfo.email);
  } catch (err) {
    console.error('[verify] session.create threw:', err);
    return NextResponse.redirect(
      `${origin}/login?error=session_failed&detail=${encodeURIComponent(
        err instanceof Error ? err.message.slice(0, 200) : 'unknown'
      )}`
    );
  }

  // Step 3: smart redirect destination
  let destination = '/dashboard';
  if (userInfo.role === 'SUPERADMIN' && !userInfo.companyId) {
    destination = '/admin/companies';
  } else if (!userInfo.companyId) {
    destination = '/onboarding';
  }

  // Step 4: build redirect response and set cookie DIRECTLY on it.
  // This is the key fix — cookies().set() does NOT apply to redirects.
  const response = NextResponse.redirect(`${origin}${destination}`);

  response.cookies.set({
    name: SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  });

  console.log('[verify] cookie set on redirect response, going to:', destination);
  return response;
}
