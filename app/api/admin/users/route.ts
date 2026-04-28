import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireRole, createInviteToken } from '@/lib/auth';
import { teamMemberInviteEmail } from '@/lib/email-templates';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import type { UserRole } from '@prisma/client';

export const maxDuration = 15;

// GET /api/admin/users — list all users with optional filters (SUPERADMIN only)
export async function GET(req: NextRequest) {
  await requireRole('SUPERADMIN');

  const url = req.nextUrl;
  const search = url.searchParams.get('search')?.toLowerCase().trim();
  const role = url.searchParams.get('role') as UserRole | null;
  const companyId = url.searchParams.get('companyId');
  const status = url.searchParams.get('status'); // 'active' | 'locked' | 'pending'

  const where: Record<string, unknown> = {};

  if (role) where.role = role;

  if (companyId === 'none') {
    where.companyId = null;
  } else if (companyId) {
    where.companyId = companyId;
  }

  if (status === 'active') {
    where.isActive = true;
    where.passwordHash = { not: null };
  } else if (status === 'locked') {
    where.isActive = false;
  } else if (status === 'pending') {
    where.passwordHash = null;
    where.isActive = true;
  }

  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      isActive: true,
      passwordHash: true, // only used to detect "pending" — not returned
      inviteAcceptedAt: true,
      lastLoginAt: true,
      createdAt: true,
      company: { select: { id: true, name: true, slug: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });

  // Strip passwordHash from response, add computed status
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
      company: u.company,
    };
  });

  return NextResponse.json({ users: sanitized });
}

// POST /api/admin/users — invite new user (SUPERADMIN only, can target any company or none)
interface CreateUserBody {
  email: string;
  name?: string;
  role: UserRole;
  companyId?: string | null;
  sendInvite?: boolean;
}

export async function POST(req: NextRequest) {
  const session = await requireRole('SUPERADMIN');

  let body: CreateUserBody;
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

  const email = body.email.toLowerCase().trim();

  // Validate company assignment based on role
  if (body.role === 'SUPERADMIN' && body.companyId) {
    return NextResponse.json({ error: 'SUPERADMIN cannot be assigned to a company' }, { status: 400 });
  }
  if (body.role !== 'SUPERADMIN' && !body.companyId) {
    return NextResponse.json({ error: 'Non-SUPERADMIN users must be assigned to a company' }, { status: 400 });
  }

  let companyName = 'Perenne';
  if (body.companyId) {
    const company = await prisma.company.findUnique({ where: { id: body.companyId }, select: { name: true } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    companyName = company.name;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name?.trim() || null,
      role: body.role,
      companyId: body.companyId || null,
      invitedByEmail: session.email,
      invitedAt: new Date(),
      isActive: true,
    },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });

  // Send invite if requested (default true)
  let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
  let emailError: string | null = null;
  let inviteUrl: string | null = null;

  if (body.sendInvite !== false) {
    try {
      inviteUrl = await createInviteToken(user.id);

      if (env.RESEND_API_KEY) {
        const resend = new Resend(env.RESEND_API_KEY);
        const { subject, html, text } = teamMemberInviteEmail({
          recipientName: user.name,
          recipientEmail: email,
          companyName,
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
        emailStatus = 'failed';
        emailError = 'RESEND_API_KEY not configured';
      }
    } catch (err) {
      emailStatus = 'failed';
      emailError = err instanceof Error ? err.message : 'Unknown error';
      console.error('[admin/users POST] Invite error:', err);
    }
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      company: user.company,
    },
    email: { status: emailStatus, error: emailError, inviteUrl },
  });
}
