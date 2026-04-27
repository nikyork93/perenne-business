import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

interface Params { params: Promise<{ id: string }>; }

// ─── PATCH: change member role ──────────────────────────────────

const patchSchema = z.object({
  role: z.enum([UserRole.ADMIN, UserRole.VIEWER, UserRole.OWNER]),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'OWNER' && session.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Only the OWNER can change roles.' }, { status: 403 });
  }

  let data: z.infer<typeof patchSchema>;
  try {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    data = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.companyId !== session.companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (target.id === session.userId) {
    return NextResponse.json({ error: 'Cannot change your own role.' }, { status: 400 });
  }

  // Promoting someone to OWNER? Demote the current OWNER to ADMIN.
  // Only one OWNER per company.
  await prisma.$transaction(async (tx) => {
    if (data.role === 'OWNER') {
      await tx.user.updateMany({
        where: { companyId: session.companyId!, role: 'OWNER' },
        data: { role: 'ADMIN' },
      });
    }
    await tx.user.update({
      where: { id },
      data: { role: data.role },
    });
    await tx.auditLog.create({
      data: {
        companyId: session.companyId!,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'team.role_changed',
        targetType: 'User',
        targetId: id,
        metadata: { oldRole: target.role, newRole: data.role },
      },
    });
  });

  return NextResponse.json({ ok: true });
}

// ─── DELETE: remove member ──────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'OWNER' && session.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Only the OWNER can remove members.' }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.companyId !== session.companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (target.id === session.userId) {
    return NextResponse.json(
      { error: 'Cannot remove yourself. Transfer ownership first.' },
      { status: 400 }
    );
  }
  if (target.role === 'OWNER') {
    return NextResponse.json(
      { error: 'Cannot remove the OWNER. Transfer ownership first.' },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    // Invalidate all their sessions
    prisma.session.deleteMany({ where: { userId: id } }),
    // Invalidate unused magic links
    prisma.magicLink.deleteMany({ where: { userId: id, usedAt: null } }),
    // Remove the user
    prisma.user.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        companyId: session.companyId!,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'team.removed',
        targetType: 'User',
        targetId: id,
        metadata: { email: target.email, role: target.role },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
