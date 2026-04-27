import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { codeDistributionEmail } from '@/lib/email-templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Params { params: Promise<{ id: string }>; }

/**
 * POST /api/distribution/[id]/resend-failed
 *
 * Retry all FAILED email logs in a batch. Useful if the provider was down,
 * or if recipient addresses were temporarily unreachable.
 *
 * Creates NEW EmailLog entries (doesn't overwrite the failed ones — keeps history).
 */
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
      emailLogs: {
        where: { status: 'FAILED' },
        include: { code: true },
      },
    },
  });

  if (!batch || (batch.companyId !== session.companyId && session.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const failedLogs = batch.emailLogs;
  if (failedLogs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, message: 'No failed emails to retry.' });
  }

  let sent = 0;
  let failed = 0;

  for (const log of failedLogs) {
    if (!log.code) continue;

    const { text, html } = codeDistributionEmail({
      recipientName: log.recipientName,
      companyName: batch.company.name,
      code: log.code.code,
      senderName: batch.company.name,
    });

    // Create a fresh EmailLog for this retry attempt
    const newLog = await prisma.emailLog.create({
      data: {
        batchId: batch.id,
        codeId: log.codeId,
        recipientEmail: log.recipientEmail,
        recipientName: log.recipientName,
        status: 'PENDING',
      },
    });

    const result = await sendEmail({
      to: log.recipientEmail,
      subject: batch.emailSubject || `Your ${batch.company.name} notebook is ready`,
      text,
      html,
    });

    if (result.ok) {
      sent++;
      await prisma.emailLog.update({
        where: { id: newLog.id },
        data: { status: 'SENT', sentAt: new Date(), resendId: result.id ?? null },
      });
    } else {
      failed++;
      await prisma.emailLog.update({
        where: { id: newLog.id },
        data: { status: 'FAILED', errorMessage: result.error ?? 'Unknown error' },
      });
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  // Update batch counters (increment by sent, adjust failed based on retries that succeeded)
  await prisma.$transaction([
    prisma.distributionBatch.update({
      where: { id: batch.id },
      data: {
        sentCount: { increment: sent },
        // don't touch failedCount — it still reflects the total number that failed at some point
      },
    }),
    prisma.auditLog.create({
      data: {
        companyId: batch.companyId,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'distribution.resent',
        targetType: 'DistributionBatch',
        targetId: batch.id,
        metadata: { retriesSent: sent, retriesFailed: failed },
      },
    }),
  ]);

  return NextResponse.json({ ok: true, sent, failed });
}
