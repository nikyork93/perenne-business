import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/admin/codes/assign-design  (SUPERADMIN only)
 *
 * Assigns a Design to one or more existing NotebookCode records. Used
 * when codes were created without a design (the iOS redeem returned
 * `design: null`) and you want to retroactively link them to a design
 * so the next activation sees the cover/watermarks.
 *
 * Body (one of two shapes):
 *   { code: "PRN-XXXX", designId: "..." }              — single code
 *   { batchLabel: "Q4 2026", companyId: "...",
 *     designId: "..." }                                — entire batch
 *
 * Behaviour:
 *   - Validates the design belongs to the same company as the codes.
 *   - Updates NotebookCode.designId. Does NOT touch Order, so Stripe
 *     codes still respect their frozen designSnapshotJson — we only
 *     update the direct designId, which the redeem route now reads
 *     with first priority (see /api/team/[code]/redeem v44).
 *   - Even already-CLAIMED codes are updated, but iOS won't refetch
 *     them automatically (one-shot rule). New activations see the
 *     new design; old activations keep what they got at claim time.
 */

const singleSchema = z.object({
  code: z.string().min(1).max(64),
  designId: z.string().cuid(),
});

const batchSchema = z.object({
  batchLabel: z.string().min(1),
  companyId: z.string().cuid(),
  designId: z.string().cuid(),
});

const bodySchema = z.union([singleSchema, batchSchema]);

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

  // Validate design exists + grab its company for scope check
  const design = await prisma.design.findUnique({
    where: { id: body.designId },
    select: { id: true, companyId: true, name: true },
  });
  if (!design) {
    return NextResponse.json({ error: 'Design not found.' }, { status: 404 });
  }

  if ('code' in body) {
    // Single code path
    const code = body.code.trim().toUpperCase();
    const target = await prisma.notebookCode.findUnique({
      where: { code },
      select: { id: true, companyId: true },
    });
    if (!target) {
      return NextResponse.json({ error: 'Code not found.' }, { status: 404 });
    }
    if (target.companyId !== design.companyId) {
      return NextResponse.json(
        { error: 'Design and code belong to different companies.' },
        { status: 400 }
      );
    }
    await prisma.notebookCode.update({
      where: { id: target.id },
      data: { designId: design.id },
    });
    return NextResponse.json({ ok: true, updated: 1, designName: design.name });
  }

  // Batch path
  if (body.companyId !== design.companyId) {
    return NextResponse.json(
      { error: 'Design and batch belong to different companies.' },
      { status: 400 }
    );
  }
  const result = await prisma.notebookCode.updateMany({
    where: {
      companyId: body.companyId,
      batchLabel: body.batchLabel,
    },
    data: { designId: design.id },
  });

  return NextResponse.json({
    ok: true,
    updated: result.count,
    designName: design.name,
  });
}
