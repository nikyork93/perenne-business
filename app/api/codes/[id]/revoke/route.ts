import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/codes/[id]/revoke
 *
 * Marks a code as REVOKED. The iOS app will receive a 410 response
 * if anyone tries to use the code from then on. Already-claimed
 * codes can still be revoked (the user's iPad will lose access on
 * next /api/team poll).
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
  if (code.status === 'REVOKED') {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  await prisma.notebookCode.update({
    where: { id },
    data: { status: 'REVOKED' },
  });

  await prisma.auditLog
    .create({
      data: {
        actorEmail: session.email,
        actorRole: session.role,
        action: 'code.revoke',
        targetType: 'NotebookCode',
        targetId: id,
        companyId: code.companyId,
        metadata: { code: code.code, prevStatus: code.status },
      },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
