import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createResetPasswordToken } from '@/lib/auth';
import { resetPasswordEmail } from '@/lib/email-templates';
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
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  // Always respond success even if user doesn't exist (security: no email enumeration)
  const resetUrl = await createResetPasswordToken(email);

  if (!resetUrl) {
    // Pretend everything worked — same response time
    await new Promise((r) => setTimeout(r, 200));
    return NextResponse.json({
      success: true,
      message: 'If an account exists for this email, a reset link has been sent.',
    });
  }

  // Send email via Resend
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
      // Still respond success — don't leak whether email was sent
    }
  } else {
    console.warn('[forgot-password] RESEND_API_KEY not set — reset URL:', resetUrl);
  }

  return NextResponse.json({
    success: true,
    message: 'If an account exists for this email, a reset link has been sent.',
  });
}
