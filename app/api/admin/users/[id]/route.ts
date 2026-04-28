import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { UserRole } from '@prisma/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/users/[id] — update name/role/companyId/isActive
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await requireRole('SUPERADMIN');
  const { id } = await ctx.params;

  let body: { name?: string | null; role?: UserRole; companyId?: string | null; isActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Prevent self-demotion / self-deactivation by superadmin
  if (target.id === session.userId) {
    if (body.role && body.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
    }
    if (body.isActive === false) {
      return NextResponse.json({ error: 'You cannot deactivate yourself' }, { status: 400 });
    }
  }

  // Validate role/company combination
  const newRole = body.role ?? target.role;
  const newCompanyId = body.companyId === undefined ? target.companyId : body.companyId;

  if (newRole === 'SUPERADMIN' && newCompanyId) {
    return NextResponse.json({ error: 'SUPERADMIN cannot be assigned to a company' }, { status: 400 });
  }
  if (newRole !== 'SUPERADMIN' && !newCompanyId) {
    return NextResponse.json({ error: 'Non-SUPERADMIN users must be assigned to a company' }, { status: 400 });
  }

  if (newCompanyId) {
    const company = await prisma.company.findUnique({ where: { id: newCompanyId } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name?.trim() || null }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.companyId !== undefined && { companyId: body.companyId || null }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });

  // If user was deactivated, kill all their sessions
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
      company: updated.company,
    },
  });
}

// DELETE /api/admin/users/[id] — permanently delete
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const session = await requireRole('SUPERADMIN');
  const { id } = await ctx.params;

  if (id === session.userId) {
    return NextResponse.json({ error: 'You cannot delete yourself' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
