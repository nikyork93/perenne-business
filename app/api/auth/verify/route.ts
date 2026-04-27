import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { createSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  // Redirect helper with message
  const redirectError = (msg: string) =>
    NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/login?error=${encodeURIComponent(msg)}`);

  if (!token) return redirectError('Missing token.');

  const link = await prisma.magicLink.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!link) return redirectError('Invalid or expired link.');
  if (link.usedAt) return redirectError('This link has already been used.');
  if (link.expiresAt < new Date()) return redirectError('This link has expired.');

  // Mark link as used (one-time)
  await prisma.magicLink.update({
    where: { id: link.id },
    data: { usedAt: new Date() },
  });

  // Create session (writes cookie)
  await createSession(link.user);

  // Redirect to app
  // If user hasn't set up a company yet, send them to /onboarding; else /dashboard
  const destination = link.user.companyId || link.user.role === 'SUPERADMIN'
    ? '/dashboard'
    : '/onboarding';

  return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}${destination}`);
}
