import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/admin/codes/assign-design  — v47
 *
 * Assign a Design to a single code or to all codes in a batch.
 *
 * v47 changes vs v44:
 *   - Permissions widened: previously SUPERADMIN-only. Now any
 *     OWNER or ADMIN of the company that owns the codes can also
 *     reassign their own batches. Customers manage their own
 *     designs without needing us in the loop.
 *   - The path lives under /api/admin/codes for backward compat
 *     (the URL was already wired up by v44/v45 UI) but the
 *     authorization is per-role-and-scope, not blanket "admin".
 *
 * Body (one of two shapes):
 *   { code: "PRN-XXXX", designId: "..." }              — single code
 *   { batchLabel: "Q4 2026", companyId: "...",
 *     designId: "..." }                                — whole batch
 *
 * Authorization rules:
 *   - SUPERADMIN: can target any company.
 *   - OWNER / ADMIN: can target ONLY their own company. The endpoint
 *     verifies that the target code's / batch's companyId matches
 *     the session companyId.
 *   - Anyone else: 403.
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

  // Gate: must be OWNER, ADMIN, or SUPERADMIN. MEMBER and other
  // roles never reach the design picker UI but we double-check.
  const isPrivileged =
    session.role === 'SUPERADMIN' ||
    session.role === 'OWNER' ||
    session.role === 'ADMIN';
  if (!isPrivileged) {
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

  const design = await prisma.design.findUnique({
    where: { id: body.designId },
    select: { id: true, companyId: true, name: true },
  });
  if (!design) {
    return NextResponse.json({ error: 'Design not found.' }, { status: 404 });
  }

  if ('code' in body) {
    const code = body.code.trim().toUpperCase();
    const target = await prisma.notebookCode.findUnique({
      where: { code },
      select: { id: true, companyId: true },
    });
    if (!target) {
      return NextResponse.json({ error: 'Code not found.' }, { status: 404 });
    }
    // Company-scope check for non-superadmins
    if (session.role !== 'SUPERADMIN' && target.companyId !== session.companyId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
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

  // Batch path — same checks scaled to company
  if (session.role !== 'SUPERADMIN' && body.companyId !== session.companyId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
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
