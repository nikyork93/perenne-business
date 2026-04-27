import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { generateToken } from '@/lib/crypto';

export const runtime = 'nodejs';

// ─── GET: list team members of current company ──────────────────
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const members = await prisma.user.findMany({
    where: { companyId: session.companyId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastLoginAt: true,
      invitedByEmail: true,
      invitedAt: true,
      createdAt: true,
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json({ ok: true, members });
}

// ─── POST: invite a new team member ─────────────────────────────

const inviteSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  role: z.enum([UserRole.ADMIN, UserRole.VIEWER]),  // cannot invite OWNER or SUPERADMIN
  name: z.string().trim().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only OWNER or SUPERADMIN can invite
  if (session.role !== 'OWNER' && session.role !== 'SUPERADMIN') {
    return NextResponse.json(
      { error: 'Only the company OWNER can invite team members.' },
      { status: 403 }
    );
  }

  let data: z.infer<typeof inviteSchema>;
  try {
    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid invite data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    data = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Email already in the system?
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    // If already in the same company, this is idempotent: update role
    if (existing.companyId === session.companyId) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { role: data.role, name: data.name ?? existing.name },
      });
      return NextResponse.json({
        ok: true,
        member: { id: updated.id, email: updated.email, role: updated.role },
        message: 'User role updated.',
      });
    }
    // In a different company: refuse (we don't support multi-company users in V1)
    return NextResponse.json(
      { error: 'This email is already associated with another company.' },
      { status: 409 }
    );
  }

  const companyId = session.companyId;

  // Create user + magic link in one transaction, then send invitation email
  const { user, token } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: data.email,
        name: data.name ?? null,
        role: data.role,
        companyId,
        invitedByEmail: session.email,
        invitedAt: new Date(),
      },
    });

    // Generate magic link valid 7 days (longer than login magic link)
    const token = generateToken(32);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await tx.magicLink.create({
      data: {
        token,
        email: user.email,
        userId: user.id,
        expiresAt,
      },
    });

    await tx.auditLog.create({
      data: {
        companyId,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'team.invited',
        targetType: 'User',
        targetId: user.id,
        metadata: { email: user.email, role: user.role },
      },
    });

    return { user, token };
  });

  // Send invitation email
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`;
  const html = buildInviteEmail({
    companyName: company?.name ?? 'your company',
    inviterEmail: session.email,
    recipientName: user.name,
    inviteUrl,
    role: user.role,
  });

  sendEmail({
    to: user.email,
    subject: `You've been invited to ${company?.name ?? 'a Perenne Business company'}`,
    html,
    text: `Join ${company?.name} on Perenne Business: ${inviteUrl}\n\nThis invite expires in 7 days.`,
  }).catch((e) => console.error('Invite email send failed:', e));

  return NextResponse.json({
    ok: true,
    member: { id: user.id, email: user.email, role: user.role },
    message: 'Invitation sent.',
  });
}

// ─── Invite email HTML ──────────────────────────────────────────

function buildInviteEmail(params: {
  companyName: string;
  inviterEmail: string;
  recipientName: string | null;
  inviteUrl: string;
  role: UserRole;
}): string {
  const greeting = params.recipientName ? `Hi ${params.recipientName},` : 'Hi,';
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#f5f5f0;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0f;padding:48px 24px;">
    <tr><td align="center">
      <table width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:rgba(212,165,116,0.8);">Invitation</p>
          <h1 style="margin:0 0 24px 0;font-family:Georgia,serif;font-style:italic;font-size:26px;font-weight:400;color:#f5f5f0;letter-spacing:-0.02em;">
            Join ${escapeHtml(params.companyName)} on Perenne Business
          </h1>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.85);">${greeting}</p>
          <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.85);">
            ${escapeHtml(params.inviterEmail)} has invited you to join <strong>${escapeHtml(params.companyName)}</strong> on Perenne Business as a ${params.role === 'ADMIN' ? 'team admin' : 'viewer'}.
          </p>
          <table cellspacing="0" cellpadding="0"><tr><td style="background:#d4a574;border-radius:10px;">
            <a href="${params.inviteUrl}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#1a1309;text-decoration:none;letter-spacing:0.02em;">Accept invitation →</a>
          </td></tr></table>
          <p style="margin:32px 0 0 0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.4);">
            This invite expires in 7 days. If you weren't expecting this, you can safely ignore the email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
