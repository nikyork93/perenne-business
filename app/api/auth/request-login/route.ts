import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { generateToken } from '@/lib/crypto';
import { sendEmail, magicLinkEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

const MAGIC_LINK_TTL_MIN = 15;

export async function POST(req: NextRequest) {
  // ── Rate limit per IP (brute-force protection) ───────────────
  const ip = req.headers.get('cf-connecting-ip') ||
             req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             'unknown';
  const rl = rateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${rl.retryAfterSec} seconds.` },
      { status: 429 }
    );
  }

  // ── Parse body ──────────────────────────────────────────────
  let email: string;
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }
    email = parsed.data.email;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // ── Find or create user ─────────────────────────────────────
  // For MVP, signup == login: any email gets a magic link.
  // If you want invite-only later, change this to error on !user.
  let user = await prisma.user.findUnique({ where: { email } });

  // For existing unknown users: we allow account creation on first login
  // (company setup will be prompted after login if user has no companyId)
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        role: email.toLowerCase() === env.SUPERADMIN_EMAIL.toLowerCase() ? 'SUPERADMIN' : 'OWNER',
      },
    });
  }

  // ── Generate & persist magic link ───────────────────────────
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000);

  // Invalidate old unused magic links for this user
  await prisma.magicLink.deleteMany({
    where: { userId: user.id, usedAt: null },
  });

  await prisma.magicLink.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  // ── Send email ───────────────────────────────────────────────
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`;
  const { text, html } = magicLinkEmail({
    recipientName: user.name,
    url,
    expiresInMinutes: MAGIC_LINK_TTL_MIN,
  });

  const result = await sendEmail({
    to: user.email,
    subject: 'Your Perenne Business sign-in link',
    html,
    text,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Could not send email. Try again shortly.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: 'Check your inbox for the sign-in link.',
  });
}
