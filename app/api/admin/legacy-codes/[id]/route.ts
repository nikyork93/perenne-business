/**
 * /api/admin/legacy-codes/[id]
 *
 *   GET    → fetch one
 *   PATCH  → update fields
 *   DELETE → hard delete (no soft-archive — admin codes are simple)
 *
 * SUPERADMIN only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

async function loadAndCheck(id: string, role: string) {
  if (role !== 'SUPERADMIN') return { error: 'Forbidden.', status: 403 as const };
  const code = await prisma.legacyTeamCode.findUnique({ where: { id } });
  if (!code) return { error: 'Not found.', status: 404 as const };
  return { code };
}

// ── GET ─────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  const result = await loadAndCheck(id, session.role);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ code: result.code });
}

// ── PATCH ───────────────────────────────────────────────────────────
const patchBodySchema = z.object({
  label: z.string().trim().max(120).nullable().optional(),
  companyId: z.string().cuid().nullable().optional(),
  designId: z.string().cuid().nullable().optional(),
  manualCompanyName: z.string().trim().max(120).nullable().optional(),
  manualLogoUrl: z.string().url().nullable().optional(),
  manualLogoExtUrl: z.string().url().nullable().optional(),
  manualLogoWhiteUrl: z.string().url().nullable().optional(),
  manualPrimaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  manualQuote: z.string().trim().max(500).nullable().optional(),
  seats: z.number().int().min(1).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  const result = await loadAndCheck(id, session.role);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  let body: z.infer<typeof patchBodySchema>;
  try {
    body = patchBodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
            : 'Invalid JSON.',
      },
      { status: 400 }
    );
  }

  // Build partial update — only touch keys actually present in body
  const data: Prisma.LegacyTeamCodeUpdateInput = {};
  if (body.label !== undefined) data.label = body.label;
  if (body.companyId !== undefined) {
    data.company = body.companyId ? { connect: { id: body.companyId } } : { disconnect: true };
  }
  if (body.designId !== undefined) {
    data.design = body.designId ? { connect: { id: body.designId } } : { disconnect: true };
  }
  if (body.manualCompanyName !== undefined) data.manualCompanyName = body.manualCompanyName;
  if (body.manualLogoUrl !== undefined) data.manualLogoUrl = body.manualLogoUrl;
  if (body.manualLogoExtUrl !== undefined) data.manualLogoExtUrl = body.manualLogoExtUrl;
  if (body.manualLogoWhiteUrl !== undefined) data.manualLogoWhiteUrl = body.manualLogoWhiteUrl;
  if (body.manualPrimaryColor !== undefined) data.manualPrimaryColor = body.manualPrimaryColor;
  if (body.manualQuote !== undefined) data.manualQuote = body.manualQuote;
  if (body.seats !== undefined) data.seats = body.seats;
  if (body.expiresAt !== undefined) {
    data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  }
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const updated = await prisma.legacyTeamCode.update({
    where: { id },
    data,
  });

  await prisma.auditLog.create({
    data: {
      companyId: updated.companyId ?? null,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'legacy_code.updated',
      targetType: 'LegacyTeamCode',
      targetId: id,
      metadata: { code: updated.code } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ code: updated });
}

// ── DELETE ──────────────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  const result = await loadAndCheck(id, session.role);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await prisma.legacyTeamCode.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      companyId: result.code.companyId ?? null,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'legacy_code.deleted',
      targetType: 'LegacyTeamCode',
      targetId: id,
      metadata: { code: result.code.code } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true });
}
