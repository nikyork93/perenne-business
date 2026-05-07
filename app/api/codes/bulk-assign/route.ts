import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(120).optional().nullable(),
});

const bodySchema = z.object({
  /** If provided, only assign codes from this batch label */
  batchLabel: z.string().trim().max(120).optional().nullable(),
  /** Recipients to assign one code each */
  recipients: z.array(recipientSchema).min(1).max(500),
});

/**
 * POST /api/codes/bulk-assign
 *
 * Assigns AVAILABLE+unassigned codes to recipients, one code per recipient.
 *
 * - Admin-scope only (no VIEWER).
 * - If `batchLabel` is provided, only codes from that batch are eligible.
 * - Codes are picked oldest-first (FIFO from the available pool).
 * - If recipients > available codes, returns error with the count delta
 *   (no partial assignment — atomic-ish to avoid surprising the user).
 * - Skips emails already assigned to ANY code in the same company.
 *
 * Response:
 *   { ok: true, assigned: N, skipped: [{ email, reason }, ...] }
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

  // Dedupe recipients by email
  const seen = new Set<string>();
  const uniqueRecipients = body.recipients.filter((r) => {
    const e = r.email.trim().toLowerCase();
    if (seen.has(e)) return false;
    seen.add(e);
    return true;
  });

  // Skip emails that already have a code in this company
  const alreadyAssigned = await prisma.notebookCode.findMany({
    where: {
      companyId: session.companyId,
      assignedToEmail: { in: uniqueRecipients.map((r) => r.email.toLowerCase()) },
    },
    select: { assignedToEmail: true },
  });
  const alreadySet = new Set(
    alreadyAssigned.map((c) => c.assignedToEmail).filter((e): e is string => !!e)
  );
  const skippedAlreadyAssigned = uniqueRecipients
    .filter((r) => alreadySet.has(r.email.toLowerCase()))
    .map((r) => ({ email: r.email, reason: 'already_assigned' as const }));

  const eligibleRecipients = uniqueRecipients.filter(
    (r) => !alreadySet.has(r.email.toLowerCase())
  );

  if (eligibleRecipients.length === 0) {
    return NextResponse.json({
      ok: true,
      assigned: 0,
      skipped: skippedAlreadyAssigned,
    });
  }

  // Pick available unassigned codes from the pool
  const available = await prisma.notebookCode.findMany({
    where: {
      companyId: session.companyId,
      status: 'AVAILABLE',
      assignedToEmail: null,
      ...(body.batchLabel ? { batchLabel: body.batchLabel } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: eligibleRecipients.length,
    select: { id: true, code: true },
  });

  if (available.length < eligibleRecipients.length) {
    return NextResponse.json(
      {
        error: 'Not enough available codes.',
        detail: {
          requested: eligibleRecipients.length,
          available: available.length,
          missing: eligibleRecipients.length - available.length,
          batchLabel: body.batchLabel ?? null,
        },
      },
      { status: 400 }
    );
  }

  // Pair each code with a recipient (1:1)
  const updates = eligibleRecipients.map((r, i) => ({
    where: { id: available[i].id },
    data: {
      assignedToEmail: r.email.toLowerCase(),
      assignedToName: r.name ?? null,
      assignedAt: new Date(),
    },
  }));

  // Run as transaction for atomicity
  try {
    await prisma.$transaction(updates.map((u) => prisma.notebookCode.update(u)));
  } catch (err) {
    console.error('[bulk-assign] transaction failed', err);
    return NextResponse.json(
      { error: 'Database error.', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  // Audit log (best-effort, non-fatal)
  try {
    await prisma.auditLog.create({
      data: {
        actorEmail: session.email,
        actorRole: session.role,
        action: 'codes.bulk_assign',
        targetType: 'Company',
        targetId: session.companyId,
        companyId: session.companyId,
        metadata: {
          assigned: eligibleRecipients.length,
          batchLabel: body.batchLabel ?? null,
          skipped: skippedAlreadyAssigned.length,
        },
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ok: true,
    assigned: eligibleRecipients.length,
    skipped: skippedAlreadyAssigned,
  });
}
