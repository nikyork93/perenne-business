import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicLink, createSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auth/verify?token=...
 *
 * Validates the magic link token, creates a session cookie,
 * and redirects the user based on their state:
 * - SUPERADMIN with no company → /admin/companies
 * - User with no company → /onboarding
 * - User with company → /dashboard
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`);
  }

  try {
    // Step 1: validate magic link, get user info
    const userInfo = await consumeMagicLink(token);

    if (!userInfo) {
      return NextResponse.redirect(`${origin}/login?error=invalid_or_expired`);
    }

    // Step 2: create session (sets cookie)
    await createSession(userInfo.userId);

    // Step 3: log audit (best-effort, ignore failures)
    await prisma.auditLog
      .create({
        data: {
          companyId: userInfo.companyId ?? null,
          actorEmail: userInfo.email,
          actorRole: userInfo.role,
          action: 'auth.login',
          targetType: 'User',
          targetId: userInfo.userId,
        },
      })
      .catch(() => {});

    // Step 4: smart redirect based on user state
    let destination = '/dashboard';
    if (userInfo.role === 'SUPERADMIN' && !userInfo.companyId) {
      destination = '/admin/companies';
    } else if (!userInfo.companyId) {
      destination = '/onboarding';
    }

    return NextResponse.redirect(`${origin}${destination}`);
  } catch (err) {
    console.error('[/api/auth/verify] Error:', err);
    return NextResponse.redirect(`${origin}/login?error=server_error`);
  }
}
