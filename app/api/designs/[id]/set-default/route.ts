/**
 * POST /api/designs/[id]/set-default
 *
 * Promotes this design to default. Atomically demotes any other
 * default in the same company. Also dual-writes the new default to
 * the legacy CoverConfig table so iOS sees the swap.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { setDesignAsDefault, syncCoverConfigFromDesign } from '@/lib/design';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }
  if (session.role === 'VIEWER') {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  const design = await prisma.design.findFirst({
    where: { id, companyId: session.companyId },
  });
  if (!design) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (design.isArchived) {
    return NextResponse.json(
      { error: 'Cannot set archived design as default. Restore it first.' },
      { status: 400 }
    );
  }

  const updated = await setDesignAsDefault(id, session.companyId);
  await syncCoverConfigFromDesign(updated);

  await prisma.auditLog.create({
    data: {
      companyId: session.companyId,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'design.set_default',
      targetType: 'Design',
      targetId: id,
      metadata: { name: updated.name } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ design: updated });
}
