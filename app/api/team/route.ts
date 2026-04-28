import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireRole, createInviteToken } from '@/lib/auth';
import { teamMemberInviteEmail } from '@/lib/email-templates';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import type { UserRole } from '@prisma/client';

export const maxDuration = 15;

// GET /api/team — list users of the current user's company
export async function GET() {
  const session = await requireRole(['OWNER', 'ADMIN', 'VIEWER']);

  if (!session.companyId) {
    return NextResponse.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: { companyId: session.companyId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      isActive: true,
      passwordHash: true,
      inviteAcceptedAt: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
  });

  const sanitized = users.map((u) => {
    const status: 'active' | 'locked' | 'pending' = !u.isActive
      ? 'locked'
      : !u.passwordHash
        ? 'pending'
        : 'active';
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      avatarUrl: u.avatarUrl,
      status,
      inviteAcceptedAt: u.inviteAcceptedAt,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    };
  });

  return NextResponse.json({ users: sanitized });
}

// POST /api/team — invite a new member to the current user's company
interface InviteBody {
  email: string;
  name?: string;
  role: UserRole;
}

export async function POST(req: NextRequest) {
  const session = await requireRole(['OWNER', 'ADMIN']);

  if (!session.companyId) {
    return NextResponse.json({ error: 'You must be assigned to a company' }, { status: 403 });
  }

  let body: InviteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }
  if (!body.role) {
    return NextResponse.json({ error: 'Role is required' }, { status: 400 });
  }

  // Authorization rules:
  // - OWNER can invite OWNER, ADMIN, VIEWER
  // - ADMIN can only invite ADMIN, VIEWER
  // - Neither can create SUPERADMIN
  if (body.role === 'SUPERADMIN') {
    return NextResponse.json({ error: 'Cannot create Perenne team members from a company' }, { status: 403 });
  }
  if (session.role === 'ADMIN' && body.role === 'OWNER') {
    return NextResponse.json({ error: 'Only Owners can invite other Owners' }, { status: 403 });
  }

  const email = body.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true },
  });
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name?.trim() || null,
      role: body.role,
      companyId: session.companyId,
      invitedByEmail: session.email,
      invitedAt: new Date(),
      isActive: true,
    },
  });

  let emailStatus: 'sent' | 'failed' = 'failed';
  let emailError: string | null = null;
  let inviteUrl: string | null = null;

  try {
    inviteUrl = await createInviteToken(user.id);

    if (env.RESEND_API_KEY) {
      const resend = new Resend(env.RESEND_API_KEY);
      const { subject, html, text } = teamMemberInviteEmail({
        recipientName: user.name,
        recipientEmail: email,
        companyName: company.name,
        inviteUrl,
        invitedByName: session.name,
        invitedByEmail: session.email,
        role: body.role,
      });

      const result = await resend.emails.send({
        from: env.EMAIL_FROM || 'Perenne Business <business@perenne.app>',
        to: email,
        replyTo: 'nicholas@perenne.app',
        subject,
        html,
        text,
      });

      if (result.error) {
        emailStatus = 'failed';
        emailError = result.error.message;
      } else {
        emailStatus = 'sent';
      }
    } else {
      emailError = 'RESEND_API_KEY not configured';
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : 'Unknown error';
    console.error('[team POST] Invite error:', err);
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    email: { status: emailStatus, error: emailError, inviteUrl },
  });
}
