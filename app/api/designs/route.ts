/**
 * GET  /api/designs   → list non-archived designs for the current company
 * POST /api/designs   → create a new design
 *
 * Body for POST:
 *   { name: string, copyFromDesignId?: string }
 *
 * - If copyFromDesignId is provided, copies content from that design.
 * - Otherwise creates an empty design with the company's defaults.
 *
 * The first design created for a company is automatically marked as
 * default. Subsequent designs default to non-default — the user
 * explicitly promotes one via /api/designs/[id]/set-default.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { DesignSummary } from '@/types/design';

export const runtime = 'nodejs';

// ── GET ─────────────────────────────────────────────────────────────
export async function GET() {
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }

  const designs = await prisma.design.findMany({
    where: { companyId: session.companyId, isArchived: false },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      isDefault: true,
      isArchived: true,
      previewPngUrl: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { orders: true } },
    },
  });

  const summaries: DesignSummary[] = designs.map((d) => ({
    id: d.id,
    name: d.name,
    isDefault: d.isDefault,
    isArchived: d.isArchived,
    previewPngUrl: d.previewPngUrl,
    orderCount: d._count.orders,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));

  return NextResponse.json({ designs: summaries });
}

// ── POST ────────────────────────────────────────────────────────────
const createBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  copyFromDesignId: z.string().cuid().optional(),
});

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }
  if (session.role === 'VIEWER') {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  let body: z.infer<typeof createBodySchema>;
  try {
    body = createBodySchema.parse(await req.json());
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

  // Determine source content
  let source = null as
    | null
    | {
        backgroundColor: string;
        backgroundImageUrl: string | null;
        assetsJson: Prisma.InputJsonValue;
        pageWatermarksJson: Prisma.InputJsonValue | null;
        quoteText: string | null;
        quotePosition: string | null;
        quoteColor: string | null;
      };

  if (body.copyFromDesignId) {
    const src = await prisma.design.findFirst({
      where: { id: body.copyFromDesignId, companyId: session.companyId },
    });
    if (!src) {
      return NextResponse.json({ error: 'Source design not found.' }, { status: 404 });
    }
    source = {
      backgroundColor: src.backgroundColor,
      backgroundImageUrl: src.backgroundImageUrl,
      assetsJson: src.assetsJson as unknown as Prisma.InputJsonValue,
      pageWatermarksJson: (src.pageWatermarksJson ?? null) as unknown as
        | Prisma.InputJsonValue
        | null,
      quoteText: src.quoteText,
      quotePosition: src.quotePosition,
      quoteColor: src.quoteColor,
    };
  }

  // First-design-becomes-default policy
  const existingCount = await prisma.design.count({
    where: { companyId: session.companyId, isArchived: false },
  });
  const willBeDefault = existingCount === 0;

  const created = await prisma.design.create({
    data: {
      companyId: session.companyId,
      name: body.name,
      isDefault: willBeDefault,
      backgroundColor: source?.backgroundColor ?? '#1a1a1a',
      backgroundImageUrl: source?.backgroundImageUrl ?? null,
      assetsJson:
        source?.assetsJson ??
        ([] as unknown as Prisma.InputJsonValue),
      pageWatermarksJson:
        source?.pageWatermarksJson ??
        ([] as unknown as Prisma.InputJsonValue),
      quoteText: source?.quoteText ?? null,
      quotePosition: source?.quotePosition ?? 'bottom',
      quoteColor: source?.quoteColor ?? '#ffffff',
    },
  });

  await prisma.auditLog.create({
    data: {
      companyId: session.companyId,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'design.created',
      targetType: 'Design',
      targetId: created.id,
      metadata: {
        name: created.name,
        copiedFrom: body.copyFromDesignId ?? null,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ design: created }, { status: 201 });
}
