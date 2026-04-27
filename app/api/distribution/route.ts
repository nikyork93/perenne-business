import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { parseRecipients } from '@/lib/csv';

export const runtime = 'nodejs';

/**
 * Receive a CSV file + optional email template, create a DistributionBatch
 * in DRAFT state, and pre-assign N available codes to the recipients.
 *
 * Actual sending happens via POST /api/distribution/[id]/send.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['OWNER', 'ADMIN', 'SUPERADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const file = formData.get('file');
  const subject = (formData.get('subject') ?? '') as string;
  const body = (formData.get('body') ?? '') as string;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'CSV file required' }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'CSV file too large (max 2 MB)' }, { status: 400 });
  }

  const text = await file.text();
  const { recipients, errors } = parseRecipients(text);

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: 'No valid recipients found', csvErrors: errors },
      { status: 400 }
    );
  }

  const companyId = session.companyId;

  // Check we have enough available codes
  const availableCount = await prisma.notebookCode.count({
    where: { companyId, status: 'AVAILABLE', distributionId: null },
  });

  if (availableCount < recipients.length) {
    return NextResponse.json(
      {
        error: `Not enough codes. You have ${availableCount} available, need ${recipients.length}.`,
        available: availableCount,
        needed: recipients.length,
      },
      { status: 400 }
    );
  }

  // Create batch + reserve codes in transaction
  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.distributionBatch.create({
      data: {
        companyId,
        fileName: file.name,
        totalRecipients: recipients.length,
        status: 'DRAFT',
        emailSubject: subject || null,
        emailBody: body || null,
      },
    });

    // Reserve N available codes (oldest first)
    const codesToReserve = await tx.notebookCode.findMany({
      where: { companyId, status: 'AVAILABLE', distributionId: null },
      orderBy: { createdAt: 'asc' },
      take: recipients.length,
      select: { id: true },
    });

    // Assign each code to a recipient
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      const codeId = codesToReserve[i].id;
      await tx.notebookCode.update({
        where: { id: codeId },
        data: {
          distributionId: b.id,
          assignedToEmail: r.email,
          assignedToName: r.name ?? null,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        companyId,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'distribution.created',
        targetType: 'DistributionBatch',
        targetId: b.id,
        metadata: { recipients: recipients.length, fileName: file.name },
      },
    });

    return b;
  });

  return NextResponse.json({
    ok: true,
    batch: {
      id: batch.id,
      totalRecipients: batch.totalRecipients,
      status: batch.status,
    },
    csvErrors: errors.length > 0 ? errors : undefined,
  });
}
