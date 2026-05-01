import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection + security headers + host-based rewrite for the
 * legacy `api.perenne.app` domain.
 *
 * v30 hotfix: API routes without session now return 401 JSON instead
 * of redirecting to /login (which broke browser fetch from authed
 * pages — fetch followed the 307 to an HTML page and crashed).
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
  const host = req.headers.get('host') ?? '';

  // Host-based rewrite for api.perenne.app (legacy iOS endpoint)
  if (host.startsWith('api.')) {
    const teamMatch = pathname.match(/^\/team\/([^/]+)\/?$/);
    if (teamMatch) {
      const url = req.nextUrl.clone();
      url.pathname = `/api/team/${teamMatch[1]}`;
      return NextResponse.rewrite(url);
    }
    return new NextResponse('Not Found', { status: 404 });
  }

  // Standard security headers
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
    // v30 fix: API requests get 401 JSON, page requests get redirect.
    // Browser fetch() following a 307 to /login (HTML) caused
    // ERR_NETWORK_CHANGED-style failures on Save Cover.
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
