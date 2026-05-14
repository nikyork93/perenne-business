import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { parseRecipients, type Recipient } from '@/lib/csv';

export const runtime = 'nodejs';

const manualBodySchema = z.object({
  source: z.literal('manual'),
  recipients: z
    .array(
      z.object({
        email: z.string().trim().toLowerCase().email(),
        name: z.string().trim().max(120).optional().or(z.literal('')),
      })
    )
    .min(1, 'At least one recipient is required')
    .max(2000, 'Too many recipients in a single batch (max 2000)'),
  subject: z.string().trim().max(200).optional().or(z.literal('')),
  body: z.string().trim().max(5000).optional().or(z.literal('')),
});

/**
 * Receive recipients + optional email template, create a
 * DistributionBatch in DRAFT state, and pre-assign N available codes
 * to the recipients.
 *
 * Two input modes are supported:
 *   • multipart/form-data with a `file` field → CSV
 *   • application/json with { source: 'manual', recipients: [...] }
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

  const contentType = req.headers.get('content-type') ?? '';
  let recipients: Recipient[] = [];
  let fileName: string | null = null;
  let subject = '';
  let body = '';
  let csvErrors: { line: number; reason: string }[] = [];

  if (contentType.includes('application/json')) {
    let payload: z.infer<typeof manualBodySchema>;
    try {
      const json = await req.json();
      const parsed = manualBodySchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid payload', details: parsed.error.flatten() },
          { status: 400 }
        );
      }
      payload = parsed.data;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Deduplicate by email, keep first name encountered.
    const seen = new Set<string>();
    payload.recipients.forEach((r, idx) => {
      if (seen.has(r.email)) return;
      seen.add(r.email);
      recipients.push({
        email: r.email,
        name: r.name || undefined,
        rowIndex: idx + 1,
      });
    });
    subject = payload.subject ?? '';
    body = payload.body ?? '';
    fileName = `manual-${new Date().toISOString().slice(0, 10)}.list`;
  } else {
    // Legacy CSV multipart path
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
    }

    const file = formData.get('file');
    subject = (formData.get('subject') ?? '') as string;
    body = (formData.get('body') ?? '') as string;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'CSV file required' }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'CSV file too large (max 2 MB)' }, { status: 400 });
    }

    const text = await file.text();
    const parsed = parseRecipients(text);
    recipients = parsed.recipients;
    csvErrors = parsed.errors;
    fileName = file.name;
  }

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: 'No valid recipients found', csvErrors },
      { status: 400 }
    );
  }

  const companyId = session.companyId;

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

  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.distributionBatch.create({
      data: {
        companyId,
        fileName,
        totalRecipients: recipients.length,
        status: 'DRAFT',
        emailSubject: subject || null,
        emailBody: body || null,
      },
    });

    const codesToReserve = await tx.notebookCode.findMany({
      where: { companyId, status: 'AVAILABLE', distributionId: null },
      orderBy: { createdAt: 'asc' },
      take: recipients.length,
      select: { id: true },
    });

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
        metadata: { recipients: recipients.length, fileName, source: contentType.includes('application/json') ? 'manual' : 'csv' },
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
    csvErrors: csvErrors.length > 0 ? csvErrors : undefined,
  });
}
