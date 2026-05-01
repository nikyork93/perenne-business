/**
 * POST /api/designs/[id]/rename
 *
 * Body: { name: string }
 *
 * Convenience endpoint for the inline rename UI in the editor header
 * and on the library cards. The same change can be done via PATCH
 * /api/designs/[id] with { name }, but a dedicated route makes the
 * audit log entry cleaner ("design.renamed" vs generic "design.updated")
 * and lets us scope error messages tighter.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
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

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
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

  const design = await prisma.design.findFirst({
    where: { id, companyId: session.companyId },
  });
  if (!design) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  // No-op if name is unchanged — short-circuit so we don't pollute the
  // audit log with empty rename events when the user types and bails.
  if (design.name === body.name) {
    return NextResponse.json({ design });
  }

  const updated = await prisma.design.update({
    where: { id },
    data: { name: body.name },
  });

  await prisma.auditLog.create({
    data: {
      companyId: session.companyId,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'design.renamed',
      targetType: 'Design',
      targetId: id,
      metadata: {
        from: design.name,
        to: body.name,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ design: updated });
}
