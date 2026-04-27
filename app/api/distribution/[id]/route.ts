import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

interface Params { params: Promise<{ id: string }>; }

/**
 * GET /api/distribution/[id] — detail of a distribution batch with
 * per-recipient EmailLog status.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const batch = await prisma.distributionBatch.findUnique({
    where: { id },
    include: {
      emailLogs: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          recipientEmail: true,
          recipientName: true,
          status: true,
          sentAt: true,
          errorMessage: true,
          resendId: true,
        },
      },
    },
  });

  if (!batch || (batch.companyId !== session.companyId && session.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    batch: {
      id: batch.id,
      fileName: batch.fileName,
      totalRecipients: batch.totalRecipients,
      sentCount: batch.sentCount,
      failedCount: batch.failedCount,
      status: batch.status,
      emailSubject: batch.emailSubject,
      emailBody: batch.emailBody,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      emailLogs: batch.emailLogs,
    },
  });
}
