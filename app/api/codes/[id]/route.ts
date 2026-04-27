import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CodeStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

interface Params { params: Promise<{ id: string }>; }

const patchSchema = z.object({
  action: z.enum(['revoke', 'restore']),
});

/**
 * PATCH /api/codes/[id]
 *
 * Actions:
 *   - revoke:  AVAILABLE → REVOKED (e.g. employee left the company)
 *   - restore: REVOKED → AVAILABLE (undo a revoke)
 *
 * CLAIMED codes cannot be revoked (they're already bound to a device).
 * OWNER or ADMIN only.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['OWNER', 'ADMIN', 'SUPERADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  let action: 'revoke' | 'restore';
  try {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    action = parsed.data.action;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const code = await prisma.notebookCode.findUnique({ where: { id } });
  if (!code || code.companyId !== session.companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (action === 'revoke') {
    if (code.status === 'CLAIMED') {
      return NextResponse.json(
        { error: 'Cannot revoke a code already claimed on a device.' },
        { status: 400 }
      );
    }
    if (code.status === 'REVOKED') {
      return NextResponse.json({ ok: true, message: 'Already revoked.' });
    }

    // Warn if the code is assigned to a draft batch — revoking it doesn't
    // remove it from the batch, but the batch will fail to send to that recipient.
    let warning: string | undefined;
    if (code.distributionId) {
      const batch = await prisma.distributionBatch.findUnique({
        where: { id: code.distributionId },
        select: { status: true },
      });
      if (batch?.status === 'DRAFT') {
        warning = 'Code was assigned to a draft batch. The batch will skip this recipient.';
      }
    }

    await prisma.$transaction([
      prisma.notebookCode.update({
        where: { id },
        data: { status: 'REVOKED' },
      }),
      prisma.auditLog.create({
        data: {
          companyId: session.companyId,
          actorEmail: session.email,
          actorRole: session.role,
          action: 'code.revoked',
          targetType: 'NotebookCode',
          targetId: id,
          metadata: { code: code.code, assignedTo: code.assignedToEmail },
        },
      }),
    ]);

    return NextResponse.json({ ok: true, warning });
  } else {
    // restore
    if (code.status !== 'REVOKED') {
      return NextResponse.json(
        { error: 'Only REVOKED codes can be restored.' },
        { status: 400 }
      );
    }
    await prisma.$transaction([
      prisma.notebookCode.update({
        where: { id },
        data: { status: 'AVAILABLE' },
      }),
      prisma.auditLog.create({
        data: {
          companyId: session.companyId,
          actorEmail: session.email,
          actorRole: session.role,
          action: 'code.restored',
          targetType: 'NotebookCode',
          targetId: id,
          metadata: { code: code.code },
        },
      }),
    ]);
  }

  return NextResponse.json({ ok: true });
}
