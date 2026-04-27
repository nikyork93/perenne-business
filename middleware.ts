import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection + security headers.
 *
 * Public paths: landing `/`, `/login`, `/design`, auth API endpoints.
 * Everything else: redirects to /login if no session cookie present.
 *
 * NOTE: We only check for cookie presence here (Edge runtime).
 * Full session validation happens in page components via `requireSession()`
 * because Prisma doesn't run on the Edge.
 */

const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/design',
  '/favicon.ico',
  '/favicon.svg',
  '/robots.txt',
]);

const PUBLIC_PREFIXES = [
  '/api/auth/',          // login, verify, logout are public
  '/api/codes/claimed',  // worker webhook (HMAC-authed)
  '/_next/',             // Next.js internals
  '/fonts/',
  '/images/',
];

const SESSION_COOKIE = 'perenne_session';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Security headers applied to every response
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Allow public paths through
  if (PUBLIC_PATHS.has(pathname)) return response;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return response;

  // Admin paths: need session; role check happens server-side
  // (middleware can't query DB on Edge runtime)
  const hasSession = req.cookies.get(SESSION_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Run on everything except: Next.js statics, common public assets, Stripe webhook (needs raw body)
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|robots\\.txt|api/stripe/webhook).*)',
  ],
};
