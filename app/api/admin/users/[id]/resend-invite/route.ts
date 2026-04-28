import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireRole, createInviteToken } from '@/lib/auth';
import { teamMemberInviteEmail } from '@/lib/email-templates';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/admin/users/[id]/resend-invite
export async function POST(_req: NextRequest, ctx: RouteContext) {
  const session = await requireRole(['SUPERADMIN', 'OWNER', 'ADMIN']);
  const { id } = await ctx.params;

  const target = await prisma.user.findUnique({
    where: { id },
    include: { company: { select: { name: true, id: true } } },
  });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Authorization: OWNER/ADMIN can only resend to users in their own company
  if (session.role !== 'SUPERADMIN' && target.companyId !== session.companyId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  if (target.passwordHash && target.inviteAcceptedAt) {
    return NextResponse.json(
      { error: 'This user has already set up their account. Use Reset Password instead.' },
      { status: 400 }
    );
  }

  const inviteUrl = await createInviteToken(target.id);
  const companyName = target.company?.name || 'Perenne';

  if (!env.RESEND_API_KEY) {
    return NextResponse.json({ inviteUrl, email: { status: 'failed', error: 'RESEND_API_KEY missing' } });
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { subject, html, text } = teamMemberInviteEmail({
      recipientName: target.name,
      recipientEmail: target.email,
      companyName,
      inviteUrl,
      invitedByName: session.name,
      invitedByEmail: session.email,
      role: target.role,
    });

    const result = await resend.emails.send({
      from: env.EMAIL_FROM || 'Perenne Business <business@perenne.app>',
      to: target.email,
      replyTo: 'nicholas@perenne.app',
      subject,
      html,
      text,
    });

    if (result.error) {
      return NextResponse.json({ inviteUrl, email: { status: 'failed', error: result.error.message } });
    }

    return NextResponse.json({ inviteUrl, email: { status: 'sent' } });
  } catch (err) {
    return NextResponse.json({
      inviteUrl,
      email: { status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' },
    });
  }
}
