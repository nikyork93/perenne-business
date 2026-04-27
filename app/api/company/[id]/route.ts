import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name:             z.string().trim().min(2).max(100).optional(),
  legalName:        z.string().trim().max(200).nullable().optional(),
  vatNumber:        z.string().trim().max(50).nullable().optional(),
  taxCode:          z.string().trim().max(50).nullable().optional(),
  address:          z.string().trim().max(200).nullable().optional(),
  city:             z.string().trim().max(100).nullable().optional(),
  zipCode:          z.string().trim().max(20).nullable().optional(),
  country:          z.string().length(2).toUpperCase().optional(),
  sdiCode:          z.string().trim().max(20).nullable().optional(),
  pecEmail:         z.string().email().nullable().optional().or(z.literal('')),
  primaryColor:     z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoSymbolUrl:    z.string().url().nullable().optional().or(z.literal('')),
  logoExtendedUrl:  z.string().url().nullable().optional().or(z.literal('')),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Authorization: must belong to this company with OWNER or ADMIN role,
  // OR be a SUPERADMIN
  const isSuperAdmin = session.role === 'SUPERADMIN';
  const belongsToCompany = session.companyId === id;
  const canEdit = isSuperAdmin ||
    (belongsToCompany && (session.role === 'OWNER' || session.role === 'ADMIN'));

  if (!canEdit) {
    // 404 instead of 403 to avoid confirming existence
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let data: z.infer<typeof bodySchema>;
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    data = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Normalize empty-strings to null
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    patch[k] = v === '' ? null : v;
  }

  // Only OWNER/SUPERADMIN can change fiscal data
  if (session.role === 'ADMIN') {
    for (const forbidden of ['vatNumber', 'taxCode', 'legalName', 'sdiCode', 'pecEmail']) {
      if (forbidden in patch) {
        return NextResponse.json(
          { error: `Field '${forbidden}' can only be changed by OWNER.` },
          { status: 403 }
        );
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.company.update({
      where: { id },
      data: patch,
    });

    await tx.auditLog.create({
      data: {
        companyId: id,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'company.updated',
        targetType: 'Company',
        targetId: id,
        metadata: { fields: Object.keys(patch) },
      },
    });

    return u;
  });

  return NextResponse.json({ ok: true, company: updated });
}
