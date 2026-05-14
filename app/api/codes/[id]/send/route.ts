import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { codeDistributionEmail } from '@/lib/email-templates';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface Params { params: Promise<{ id: string }>; }

const bodySchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  name: z.string().trim().max(120).optional().or(z.literal('')),
  // When the code has already been sent (either single-send or via
  // distribution batch), the client must explicitly confirm a resend.
  confirmResend: z.boolean().optional(),
});

/**
 * POST /api/codes/[id]/send
 *
 * Send (or resend) a single notebook code to one email address. This
 * is the per-row "Send" action in the Codes table; it complements the
 * bulk-send flow in /api/distribution/[id]/send.
 *
 * Server-side guardrails:
 *   - OWNER / ADMIN / SUPERADMIN only
 *   - Code must belong to the caller's company
 *   - CLAIMED or REVOKED codes refuse (the recipient can't use them)
 *   - If a SENT EmailLog already exists, require confirmResend=true
 *
 * Side effects:
 *   - Creates an EmailLog (PENDING → SENT/FAILED)
 *   - If the code wasn't already assigned, fills assignedToEmail/Name
 *   - Audit log entry: codes.send
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['OWNER', 'ADMIN', 'SUPERADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  let payload: z.infer<typeof bodySchema>;
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
    }
    payload = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const code = await prisma.notebookCode.findUnique({
    where: { id },
    include: {
      company: true,
      emailLogs: {
        where: { status: 'SENT' },
        orderBy: { sentAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!code) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (code.companyId !== session.companyId && session.role !== 'SUPERADMIN') {
    // 404 not 403 to avoid leaking existence
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (code.status === 'CLAIMED') {
    return NextResponse.json(
      { error: 'This code has already been claimed by another device and cannot be re-sent.' },
      { status: 400 }
    );
  }
  if (code.status === 'REVOKED') {
    return NextResponse.json(
      { error: 'This code is revoked. Restore it first if you want to send it.' },
      { status: 400 }
    );
  }

  const alreadySent = code.emailLogs.length > 0 || code.distributionId !== null;
  if (alreadySent && !payload.confirmResend) {
    return NextResponse.json(
      {
        error: 'ALREADY_SENT',
        message: code.distributionId
          ? 'This code has already been sent as part of a distribution batch. Confirm to resend to a new recipient.'
          : 'This code has already been sent. Confirm to resend.',
        previousRecipient: code.emailLogs[0]?.recipientEmail ?? code.assignedToEmail,
      },
      { status: 409 }
    );
  }

  // Update assignedTo fields IF they were empty. We don't overwrite
  // existing assignments (e.g. from a batch CSV) — the resend goes to
  // the new address but the canonical assignment stays.
  const shouldUpdateAssignment = !code.assignedToEmail;
  if (shouldUpdateAssignment) {
    await prisma.notebookCode.update({
      where: { id: code.id },
      data: {
        assignedToEmail: payload.email,
        assignedToName: payload.name || null,
      },
    });
  }

  const { text, html } = codeDistributionEmail({
    recipientName: payload.name || null,
    companyName: code.company.name,
    code: code.code,
    senderName: code.company.name,
  });

  // Optimistic PENDING log
  const log = await prisma.emailLog.create({
    data: {
      codeId: code.id,
      // batchId left null — single-send is distinct from batch.
      recipientEmail: payload.email,
      recipientName: payload.name || null,
      status: 'PENDING',
    },
  });

  const result = await sendEmail({
    to: payload.email,
    subject: `Your ${code.company.name} notebook is ready`,
    text,
    html,
  });

  if (result.ok) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'SENT', sentAt: new Date(), resendId: result.id ?? null },
    });
    await prisma.auditLog.create({
      data: {
        companyId: code.companyId,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'codes.send',
        targetType: 'NotebookCode',
        targetId: code.id,
        metadata: {
          recipientEmail: payload.email,
          resend: !!alreadySent,
        },
      },
    });
    return NextResponse.json({ ok: true, sent: true, logId: log.id });
  }

  await prisma.emailLog.update({
    where: { id: log.id },
    data: { status: 'FAILED', errorMessage: result.error ?? 'Unknown error' },
  });
  return NextResponse.json(
    { error: result.error ?? 'Failed to send email', sent: false, logId: log.id },
    { status: 502 }
  );
}
