import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// DELETE /api/admin/users/[id]/sessions — sign out user from all devices
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const session = await requireRole(['SUPERADMIN', 'OWNER', 'ADMIN']);
  const { id } = await ctx.params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (session.role !== 'SUPERADMIN' && target.companyId !== session.companyId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const result = await prisma.session.deleteMany({ where: { userId: id } });

  return NextResponse.json({ success: true, terminated: result.count });
}
