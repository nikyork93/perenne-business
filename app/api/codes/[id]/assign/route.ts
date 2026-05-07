import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().email().nullable(),
  name: z.string().trim().max(120).optional().nullable(),
});

/**
 * POST /api/codes/[id]/assign
 *
 * Assigns a code to a recipient email (or unassigns if email is null).
 * Company admins can only assign codes from their own company.
 * Once a code is CLAIMED you cannot reassign it (the user already
 * activated it on a device).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }
  if (session.role === 'VIEWER') {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body.', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const code = await prisma.notebookCode.findUnique({
    where: { id },
    select: { id: true, companyId: true, status: true },
  });
  if (!code) {
    return NextResponse.json({ error: 'Code not found.' }, { status: 404 });
  }
  // Tenant guard
  if (code.companyId !== session.companyId && session.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  if (code.status === 'CLAIMED') {
    return NextResponse.json(
      { error: 'Cannot reassign a claimed code.' },
      { status: 400 }
    );
  }

  const updated = await prisma.notebookCode.update({
    where: { id },
    data: {
      assignedToEmail: body.email,
      assignedToName: body.name ?? null,
      assignedAt: body.email ? new Date() : null,
    },
    select: {
      id: true,
      assignedToEmail: true,
      assignedToName: true,
      assignedAt: true,
    },
  });

  return NextResponse.json({ ok: true, code: updated });
}
