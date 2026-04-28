import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireRole, createResetPasswordToken } from '@/lib/auth';
import { resetPasswordEmail } from '@/lib/email-templates';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/admin/users/[id]/reset-password — admin sends a password reset email
export async function POST(_req: NextRequest, ctx: RouteContext) {
  const session = await requireRole(['SUPERADMIN', 'OWNER', 'ADMIN']);
  const { id } = await ctx.params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (session.role !== 'SUPERADMIN' && target.companyId !== session.companyId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Re-activate locked accounts when admin sends reset
  if (!target.isActive) {
    await prisma.user.update({ where: { id }, data: { isActive: true } });
  }

  const resetUrl = await createResetPasswordToken(target.email);
  if (!resetUrl) {
    return NextResponse.json({ error: 'Could not generate reset link' }, { status: 500 });
  }

  if (!env.RESEND_API_KEY) {
    return NextResponse.json({ resetUrl, email: { status: 'failed', error: 'RESEND_API_KEY missing' } });
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { subject, html, text } = resetPasswordEmail({
      recipientName: target.name,
      recipientEmail: target.email,
      resetUrl,
    });

    await resend.emails.send({
      from: env.EMAIL_FROM || 'Perenne Business <business@perenne.app>',
      to: target.email,
      replyTo: 'nicholas@perenne.app',
      subject,
      html,
      text,
    });

    return NextResponse.json({ email: { status: 'sent' } });
  } catch (err) {
    return NextResponse.json({
      email: { status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' },
    });
  }
}
