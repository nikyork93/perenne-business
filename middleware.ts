import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection + security headers + host-based rewrite for the
 * legacy `api.perenne.app` domain.
 *
 * --- Hostnames ---
 *
 *   business.perenne.app — primary host (web app, dashboard, /api/*)
 *   api.perenne.app      — legacy host inherited from the dismissed
 *                          Cloudflare Worker. iOS app calls
 *                          GET https://api.perenne.app/team/{CODE}
 *                          to activate a team code. We rewrite that
 *                          to /api/team/[code] so iOS keeps working
 *                          with zero App Store update.
 *
 * Anything other than `/team/{CODE}` on api.perenne.app returns 404
 * (the old admin panel `/admin` and HMAC endpoints are gone).
 *
 * --- Public paths ---
 *
 * Public paths: landing, login, invite acceptance, password recovery,
 * design preview, AND the public team-resolve endpoint /api/team/*.
 * Everything else: redirects to /login if no session cookie present.
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
  '/api/auth/',           // login, accept-invite, forgot-password, reset-password
  '/api/codes/claimed',   // worker webhook (HMAC-authed) — kept for back-compat
  '/api/team/',           // public team-code resolve (replaces Worker /team/{CODE})
  '/_next/',
  '/fonts/',
  '/images/',
];

const SESSION_COOKIE = 'perenne_session';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get('host') ?? '';

  // ─── Host-based rewrite for api.perenne.app ───────────────────────
  // Match any host starting with "api." so this works for both prod
  // (api.perenne.app) and any future preview deploy (api.staging.…).
  if (host.startsWith('api.')) {
    // Only `/team/CODE` is exposed on the api host. Everything else
    // gets a flat 404 — the legacy Worker had /admin, /codes/sync,
    // /companies/sync, /assets/upload but those are now on the
    // primary host (business.perenne.app) under different routes.
    const teamMatch = pathname.match(/^\/team\/([^/]+)\/?$/);
    if (teamMatch) {
      const url = req.nextUrl.clone();
      url.pathname = `/api/team/${teamMatch[1]}`;
      return NextResponse.rewrite(url);
    }
    return new NextResponse('Not Found', { status: 404 });
  }

  // ─── Standard security headers (primary host) ─────────────────────
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
