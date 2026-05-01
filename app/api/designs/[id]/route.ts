/**
 * GET    /api/designs/[id]   → fetch a single design (full content)
 * PATCH  /api/designs/[id]   → update fields (name, content)
 * DELETE /api/designs/[id]   → archive (or hard-delete if no orders reference it)
 *
 * Notes:
 * - Default design cannot be archived (must promote another first).
 * - PATCH on the default design also dual-writes to the legacy
 *   CoverConfig table so iOS, which still reads CoverConfig, sees
 *   the new state. Non-default designs never touch CoverConfig.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncCoverConfigFromDesign } from '@/lib/design';

export const runtime = 'nodejs';

// ── helper: load + scope-check ──────────────────────────────────────
async function loadDesign(id: string, companyId: string) {
  return prisma.design.findFirst({ where: { id, companyId } });
}

// ── GET ─────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }

  const design = await loadDesign(id, session.companyId);
  if (!design) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  return NextResponse.json({ design });
}

// ── PATCH ───────────────────────────────────────────────────────────
const assetRefSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  dataUrl: z.string().optional(),
  x: z.number(),
  y: z.number(),
  scale: z.number(),
  rotation: z.number(),
  opacity: z.number(),
  invert: z.boolean().optional(),
});

const updateBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  backgroundColor: z.string().optional(),
  backgroundImageUrl: z.string().nullable().optional(),
  assets: z.array(assetRefSchema).optional(),
  pageWatermarks: z.array(assetRefSchema).nullable().optional(),
  quote: z
    .object({
      text: z.string().nullable(),
      position: z.string(),
      color: z.string(),
    })
    .nullable()
    .optional(),
  previewPngUrl: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }
  if (session.role === 'VIEWER') {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  const design = await loadDesign(id, session.companyId);
  if (!design) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (design.isArchived) {
    return NextResponse.json(
      { error: 'Design is archived. Restore it before editing.' },
      { status: 400 }
    );
  }

  let body: z.infer<typeof updateBodySchema>;
  try {
    body = updateBodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? err.errors.map((e) => e.message).join(', ')
            : 'Invalid JSON.',
      },
      { status: 400 }
    );
  }

  // Build the partial update; only touch keys actually present in body
  const data: Prisma.DesignUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.backgroundColor !== undefined) data.backgroundColor = body.backgroundColor;
  if (body.backgroundImageUrl !== undefined) data.backgroundImageUrl = body.backgroundImageUrl;
  if (body.assets !== undefined) {
    data.assetsJson = body.assets as unknown as Prisma.InputJsonValue;
  }
  if (body.pageWatermarks !== undefined) {
    data.pageWatermarksJson = (body.pageWatermarks ??
      []) as unknown as Prisma.InputJsonValue;
  }
  if (body.quote !== undefined) {
    if (body.quote === null) {
      data.quoteText = null;
      // keep position/color defaults
    } else {
      data.quoteText = body.quote.text;
      data.quotePosition = body.quote.position;
      data.quoteColor = body.quote.color;
    }
  }
  if (body.previewPngUrl !== undefined) data.previewPngUrl = body.previewPngUrl;

  const updated = await prisma.design.update({
    where: { id },
    data,
  });

  // Dual-write to legacy CoverConfig so iOS keeps working until
  // Session 3 swaps it to read Order.designSnapshotJson.
  if (updated.isDefault) {
    await syncCoverConfigFromDesign(updated);
  }

  await prisma.auditLog.create({
    data: {
      companyId: session.companyId,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'design.updated',
      targetType: 'Design',
      targetId: id,
      metadata: { isDefault: updated.isDefault } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ design: updated });
}

// ── DELETE ──────────────────────────────────────────────────────────
//
// "Delete" semantics:
// - Default design cannot be deleted/archived (caller must promote
//   another design to default first).
// - If any Order references this design (orders use it for snapshot),
//   the design is ARCHIVED (soft-delete). The orders keep their
//   immutable snapshots — archiving the source has no effect on
//   already-purchased notebooks.
// - If no Order references it, we hard-delete the row.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }
  if (session.role === 'VIEWER') {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  const design = await loadDesign(id, session.companyId);
  if (!design) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (design.isDefault) {
    return NextResponse.json(
      { error: 'Cannot delete the default design. Promote another design first.' },
      { status: 400 }
    );
  }

  const orderCount = await prisma.order.count({ where: { designId: id } });

  let mode: 'archived' | 'deleted';
  if (orderCount > 0) {
    await prisma.design.update({ where: { id }, data: { isArchived: true } });
    mode = 'archived';
  } else {
    await prisma.design.delete({ where: { id } });
    mode = 'deleted';
  }

  await prisma.auditLog.create({
    data: {
      companyId: session.companyId,
      actorEmail: session.email,
      actorRole: session.role,
      action: mode === 'archived' ? 'design.archived' : 'design.deleted',
      targetType: 'Design',
      targetId: id,
      metadata: { orderCount } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true, mode });
}
