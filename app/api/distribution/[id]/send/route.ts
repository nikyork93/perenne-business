import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { codeDistributionEmail } from '@/lib/email-templates';

export const runtime = 'nodejs';
export const maxDuration = 60;  // up to 60s for batch email send

interface Params { params: Promise<{ id: string }>; }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['OWNER', 'ADMIN', 'SUPERADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const batch = await prisma.distributionBatch.findUnique({
    where: { id },
    include: {
      company: true,
      codes: {
        where: { assignedToEmail: { not: null } },
      },
    },
  });

  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  if (batch.companyId !== session.companyId && session.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (batch.status !== 'DRAFT') {
    return NextResponse.json(
      { error: `Batch is ${batch.status}, only DRAFT batches can be sent.` },
      { status: 400 }
    );
  }

  // Mark as SENDING
  await prisma.distributionBatch.update({
    where: { id },
    data: { status: 'SENDING' },
  });

  // Send emails (serial with small delay to respect provider rate limits)
  let sent = 0;
  let failed = 0;
  const PAUSE_MS = 100;

  for (const code of batch.codes) {
    if (!code.assignedToEmail) continue;

    const { text, html } = codeDistributionEmail({
      recipientName: code.assignedToName,
      companyName: batch.company.name,
      code: code.code,
      senderName: batch.company.name,
    });

    // Create EmailLog PENDING
    const log = await prisma.emailLog.create({
      data: {
        batchId: batch.id,
        codeId: code.id,
        recipientEmail: code.assignedToEmail,
        recipientName: code.assignedToName,
        status: 'PENDING',
      },
    });

    const result = await sendEmail({
      to: code.assignedToEmail,
      subject: batch.emailSubject || `Your ${batch.company.name} notebook is ready`,
      text,
      html,
    });

    if (result.ok) {
      sent++;
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date(), resendId: result.id ?? null },
      });
    } else {
      failed++;
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage: result.error ?? 'Unknown error' },
      });
    }

    if (PAUSE_MS > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  const finalStatus = failed === 0 ? 'COMPLETED' : sent === 0 ? 'FAILED' : 'COMPLETED';

  await prisma.$transaction([
    prisma.distributionBatch.update({
      where: { id: batch.id },
      data: {
        status: finalStatus,
        sentCount: sent,
        failedCount: failed,
        completedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        companyId: batch.companyId,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'distribution.sent',
        targetType: 'DistributionBatch',
        targetId: batch.id,
        metadata: { sent, failed },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    status: finalStatus,
  });
}
