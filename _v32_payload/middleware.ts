import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection + security headers.
 *
 * v32: simplified — no api.perenne.app rewrite (Cloudflare Worker
 * dismissed, iOS app will be updated to call business.perenne.app
 * directly). Only:
 *   1. security headers
 *   2. session check on protected routes
 *   3. API requests get 401 JSON instead of redirect to /login
 */

const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/invite',
  '/forgot-password',
  '/reset-password',
  '/design',
  '/favicon.ico',
  '/favicon.svg',
  '/robots.txt',
]);

const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/api/codes/claimed',
  '/api/team/',           // public team-code resolve
  '/_next/',
  '/fonts/',
  '/images/',
];

const SESSION_COOKIE = 'perenne_session';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  if (PUBLIC_PATHS.has(pathname)) return response;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return response;

  const hasSession = req.cookies.get(SESSION_COOKIE);

  if (!hasSession) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Not authenticated.' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|robots\\.txt|api/stripe/webhook).*)',
  ],
};
