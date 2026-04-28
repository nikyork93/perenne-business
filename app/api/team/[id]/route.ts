import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { UserRole } from '@prisma/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/team/[id] — OWNER/ADMIN can edit name/role/isActive of users in their company
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await requireRole(['OWNER', 'ADMIN']);
  const { id } = await ctx.params;

  let body: { name?: string | null; role?: UserRole; isActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Must be in same company
  if (target.companyId !== session.companyId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Can't modify SUPERADMIN
  if (target.role === 'SUPERADMIN') {
    return NextResponse.json({ error: 'Cannot modify Perenne team members' }, { status: 403 });
  }

  // Can't promote to SUPERADMIN
  if (body.role === 'SUPERADMIN') {
    return NextResponse.json({ error: 'Cannot create Perenne team members' }, { status: 403 });
  }

  // ADMIN cannot change OWNER role
  if (session.role === 'ADMIN') {
    if (target.role === 'OWNER') {
      return NextResponse.json({ error: 'Only Owners can modify other Owners' }, { status: 403 });
    }
    if (body.role === 'OWNER') {
      return NextResponse.json({ error: 'Only Owners can promote to Owner' }, { status: 403 });
    }
  }

  // Can't deactivate self
  if (target.id === session.userId && body.isActive === false) {
    return NextResponse.json({ error: 'You cannot deactivate yourself' }, { status: 400 });
  }
  if (target.id === session.userId && body.role && body.role !== session.role) {
    return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name?.trim() || null }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });

  if (body.isActive === false) {
    await prisma.session.deleteMany({ where: { userId: id } });
  }

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      isActive: updated.isActive,
    },
  });
}

// DELETE /api/team/[id]
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const session = await requireRole(['OWNER', 'ADMIN']);
  const { id } = await ctx.params;

  if (id === session.userId) {
    return NextResponse.json({ error: 'You cannot delete yourself' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (target.companyId !== session.companyId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  if (target.role === 'SUPERADMIN') {
    return NextResponse.json({ error: 'Cannot delete Perenne team members' }, { status: 403 });
  }

  if (session.role === 'ADMIN' && target.role === 'OWNER') {
    return NextResponse.json({ error: 'Only Owners can delete other Owners' }, { status: 403 });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
