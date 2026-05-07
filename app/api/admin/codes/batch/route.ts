import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  companyId: z.string().cuid(),
  designId: z.string().cuid().nullable().optional(),
  count: z.number().int().min(1).max(500),
  batchLabel: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(500).optional().nullable(),
});

/**
 * POST /api/admin/codes/batch  (SUPERADMIN only)
 *
 * Creates N NotebookCode records for a Company, all with:
 *  - orderId = null  (manually-issued, not Stripe-linked)
 *  - designId = optional
 *  - batchLabel = required (so admin can group/filter later)
 *
 * Codes are formatted as `PRN-XXXX-XXXX` (12 alphanum chars, dash-separated)
 * to match what we already do for Stripe codes — same parser on iOS.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
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

  // Validate company exists
  const company = await prisma.company.findUnique({
    where: { id: body.companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  }

  // Validate design (if specified) belongs to that company
  if (body.designId) {
    const design = await prisma.design.findUnique({
      where: { id: body.designId },
      select: { companyId: true },
    });
    if (!design || design.companyId !== body.companyId) {
      return NextResponse.json(
        { error: 'Design does not belong to this company.' },
        { status: 400 }
      );
    }
  }

  // Generate `body.count` unique codes
  const codes: string[] = [];
  const seen = new Set<string>();
  while (codes.length < body.count) {
    const c = generateCode();
    if (seen.has(c)) continue;
    seen.add(c);
    codes.push(c);
  }

  // Bulk insert
  try {
    const result = await prisma.notebookCode.createMany({
      data: codes.map((code) => ({
        code,
        companyId: body.companyId,
        designId: body.designId ?? null,
        batchLabel: body.batchLabel,
        notes: body.notes ?? null,
        status: 'AVAILABLE',
      })),
      skipDuplicates: true,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorEmail: session.email,
        actorRole: session.role,
        action: 'codes.batch_create',
        targetType: 'Company',
        targetId: body.companyId,
        companyId: body.companyId,
        metadata: {
          count: result.count,
          batchLabel: body.batchLabel,
          designId: body.designId ?? null,
        },
      },
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      created: result.count,
      batchLabel: body.batchLabel,
      companyId: body.companyId,
      designId: body.designId ?? null,
    });
  } catch (err) {
    console.error('[admin/codes/batch] insert failed', err);
    return NextResponse.json(
      { error: 'Failed to create codes.', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous (no I,O,0,1)
function generateCode(): string {
  // Format: PRN-XXXX-XXXX (8 random chars + prefix)
  const part = (n: number) =>
    Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  return `PRN-${part(4)}-${part(4)}`;
}
