/**
 * POST /api/designs/[id]/duplicate
 *
 * Body: { name?: string }   — optional override (defaults to "<source name> copy")
 *
 * Creates a new (non-default, non-archived) Design with the same
 * content as the source. Useful as a "Save as new" flow when iterating
 * on seasonal designs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

export async function POST(
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

  let body: z.infer<typeof bodySchema> = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = bodySchema.parse(await req.json());
    }
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

  const source = await prisma.design.findFirst({
    where: { id, companyId: session.companyId },
  });
  if (!source) {
    return NextResponse.json({ error: 'Source design not found.' }, { status: 404 });
  }

  const newName = body.name ?? `${source.name} copy`;

  const created = await prisma.design.create({
    data: {
      companyId: session.companyId,
      name: newName,
      isDefault: false,
      isArchived: false,
      backgroundColor: source.backgroundColor,
      backgroundImageUrl: source.backgroundImageUrl,
      assetsJson: source.assetsJson as unknown as Prisma.InputJsonValue,
      pageWatermarksJson:
        (source.pageWatermarksJson ?? []) as unknown as Prisma.InputJsonValue,
      quoteText: source.quoteText,
      quotePosition: source.quotePosition,
      quoteColor: source.quoteColor,
      previewPngUrl: source.previewPngUrl,
    },
  });

  await prisma.auditLog.create({
    data: {
      companyId: session.companyId,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'design.duplicated',
      targetType: 'Design',
      targetId: created.id,
      metadata: { sourceId: source.id, name: newName } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ design: created }, { status: 201 });
}
