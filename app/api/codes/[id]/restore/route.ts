import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/codes/[id]/restore
 *
 * Reverses a REVOKED code back to AVAILABLE. Note: if the code was
 * already CLAIMED before revoke, restoring puts it back to AVAILABLE
 * (un-claimed) — admin's responsibility to know what they're doing.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }
  if (session.role === 'VIEWER') {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  const { id } = await params;

  const code = await prisma.notebookCode.findUnique({
    where: { id },
    select: { id: true, companyId: true, status: true, code: true },
  });
  if (!code) {
    return NextResponse.json({ error: 'Code not found.' }, { status: 404 });
  }
  if (code.companyId !== session.companyId && session.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  if (code.status !== 'REVOKED') {
    return NextResponse.json(
      { error: 'Only revoked codes can be restored.' },
      { status: 400 }
    );
  }

  await prisma.notebookCode.update({
    where: { id },
    data: {
      status: 'AVAILABLE',
      claimedAt: null,
      claimedDeviceId: null,
      claimedIpAddress: null,
    },
  });

  await prisma.auditLog
    .create({
      data: {
        actorEmail: session.email,
        actorRole: session.role,
        action: 'code.restore',
        targetType: 'NotebookCode',
        targetId: id,
        companyId: code.companyId,
        metadata: { code: code.code },
      },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
