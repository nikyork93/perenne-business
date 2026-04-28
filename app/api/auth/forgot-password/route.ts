import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createResetPasswordToken } from '@/lib/auth';
import { resetPasswordEmail } from '@/lib/email-templates';
import { checkForgotPasswordRateLimit, recordForgotPasswordAttempt, extractIpAddress } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const email = body.email?.toLowerCase().trim();
  const ipAddress = extractIpAddress(req);

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  // Rate limit check (prevents reset spam attacks)
  const allowed = await checkForgotPasswordRateLimit(email, ipAddress);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many reset requests. Try again in 1 hour.' },
      { status: 429 }
    );
  }

  await recordForgotPasswordAttempt(email, ipAddress);

  // Always respond success even if user doesn't exist (no enumeration)
  const resetUrl = await createResetPasswordToken(email);

  if (!resetUrl) {
    await new Promise((r) => setTimeout(r, 200));
    return NextResponse.json({
      success: true,
      message: 'If an account exists for this email, a reset link has been sent.',
    });
  }

  if (env.RESEND_API_KEY) {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      const resend = new Resend(env.RESEND_API_KEY);
      const { subject, html, text } = resetPasswordEmail({
        recipientName: user?.name ?? null,
        recipientEmail: email,
        resetUrl,
      });

      await resend.emails.send({
        from: env.EMAIL_FROM || 'Perenne Business <business@perenne.app>',
        to: email,
        replyTo: 'nicholas@perenne.app',
        subject,
        html,
        text,
      });
    } catch (err) {
      console.error('[forgot-password] Resend error:', err);
    }
  } else {
    console.warn('[forgot-password] RESEND_API_KEY not set — reset URL:', resetUrl);
  }

  return NextResponse.json({
    success: true,
    message: 'If an account exists for this email, a reset link has been sent.',
  });
}
