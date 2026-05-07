import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { codeDistributionEmail } from '@/lib/code-email-template';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  /** Specific codeIds to send. If empty, sends to ALL assigned-but-not-emailed codes. */
  codeIds: z.array(z.string().cuid()).max(500).optional(),
  /** Restrict to a batch label (intersected with codeIds if both given). */
  batchLabel: z.string().trim().max(120).optional().nullable(),
  /** Optional custom message included at the top of the email. */
  customMessage: z.string().trim().max(500).optional().nullable(),
});

/**
 * POST /api/codes/distribute
 *
 * Sends activation-code emails to recipients of already-assigned codes.
 *
 * - Picks codes that are AVAILABLE + assignedToEmail set + not yet sent
 *   (no SENT EmailLog entry exists for them).
 * - For each code: sends one email via Resend (lib/email.ts) and writes
 *   an EmailLog row (status=SENT or FAILED) for tracking.
 * - Returns aggregate stats. Per-code failures don't abort the batch.
 *
 * Note: this is a foreground request — for large batches (200+) on
 * Vercel Hobby (60s function timeout) we may hit the limit. In that
 * case the user re-runs and only the un-sent ones are picked up.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }
  if (session.role === 'VIEWER') {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body.', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true },
  });
  if (!company) {
    return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  }

  // Build the candidate set
  const candidates = await prisma.notebookCode.findMany({
    where: {
      companyId: session.companyId,
      status: 'AVAILABLE',
      assignedToEmail: { not: null },
      ...(body.codeIds && body.codeIds.length > 0 ? { id: { in: body.codeIds } } : {}),
      ...(body.batchLabel ? { batchLabel: body.batchLabel } : {}),
      // Skip codes that already have a SENT email log
      NOT: {
        emailLogs: {
          some: { status: 'SENT' },
        },
      },
    },
    select: {
      id: true,
      code: true,
      assignedToEmail: true,
      assignedToName: true,
    },
    take: 500,
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      failed: 0,
      message: 'No eligible codes to send.',
    });
  }

  let sent = 0;
  let failed = 0;
  const failures: Array<{ code: string; email: string; reason: string }> = [];

  for (const c of candidates) {
    const email = c.assignedToEmail!;
    const tpl = codeDistributionEmail({
      recipientName: c.assignedToName ?? null,
      companyName: company.name,
      code: c.code,
      expiresLabel: null,
      customMessage: body.customMessage ?? null,
    });

    try {
      const result = await sendEmail({
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });

      if (result.ok) {
        sent++;
        await prisma.emailLog
          .create({
            data: {
              codeId: c.id,
              recipientEmail: email,
              status: 'SENT',
              sentAt: new Date(),
              resendId: result.id ?? null,
            },
          })
          .catch(() => null);
      } else {
        failed++;
        failures.push({ code: c.code, email, reason: result.error ?? 'send failed' });
        await prisma.emailLog
          .create({
            data: {
              codeId: c.id,
              recipientEmail: email,
              status: 'FAILED',
              errorMessage: result.error ?? 'unknown',
            },
          })
          .catch(() => null);
      }
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : 'send threw';
      failures.push({ code: c.code, email, reason });
      await prisma.emailLog
        .create({
          data: {
            codeId: c.id,
            recipientEmail: email,
            status: 'FAILED',
            errorMessage: reason,
          },
        })
        .catch(() => null);
    }
  }

  // Audit log
  try {
    await prisma.auditLog.create({
      data: {
        actorEmail: session.email,
        actorRole: session.role,
        action: 'codes.distribute',
        targetType: 'Company',
        targetId: session.companyId,
        companyId: session.companyId,
        metadata: {
          sent,
          failed,
          batchLabel: body.batchLabel ?? null,
        },
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    failures: failures.slice(0, 50),
  });
}
