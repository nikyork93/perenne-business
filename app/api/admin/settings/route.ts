import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Platform-level settings, super-admin only. Backed by the singleton
 * AdminSettings row (id = "default"). GET returns the current values,
 * PATCH updates the supplied fields.
 *
 * Keeping bank details in the DB means they can be edited from the UI
 * without a redeploy, and env vars become an optional override for
 * staging/local. lib/bank.ts:getBankDetails picks the right precedence.
 */
const bodySchema = z.object({
  bankBeneficiary: z.string().trim().max(200).nullable().optional().or(z.literal('')),
  bankAddress:     z.string().trim().max(300).nullable().optional().or(z.literal('')),
  bankVat:         z.string().trim().max(50).nullable().optional().or(z.literal('')),
  bankName:        z.string().trim().max(200).nullable().optional().or(z.literal('')),
  bankIban:        z.string().trim().max(50).nullable().optional().or(z.literal('')),
  bankBic:         z.string().trim().max(20).nullable().optional().or(z.literal('')),
  bankNotice:      z.string().trim().max(1000).nullable().optional().or(z.literal('')),
});

export async function GET() {
  await requireRole('SUPERADMIN');
  const row = await prisma.adminSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });
  return NextResponse.json({ ok: true, settings: row });
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole('SUPERADMIN');

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Translate empty strings into null so the DB doesn't keep stale
  // blanks pretending to be values. A missing key (undefined) is
  // skipped, which lets PATCH update a subset.
  const data: Record<string, string | null | undefined> = { updatedByEmail: session.email };
  for (const key of [
    'bankBeneficiary', 'bankAddress', 'bankVat',
    'bankName', 'bankIban', 'bankBic', 'bankNotice',
  ] as const) {
    if (key in body) {
      const v = body[key];
      data[key] = v === '' ? null : (v ?? null);
    }
  }

  const updated = await prisma.adminSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...data },
    update: data,
  });

  await prisma.auditLog.create({
    data: {
      actorEmail: session.email,
      actorRole: session.role,
      action: 'admin.settings.updated',
      targetType: 'AdminSettings',
      targetId: 'default',
      metadata: { fields: Object.keys(data).filter((k) => k !== 'updatedByEmail') },
    },
  });

  return NextResponse.json({ ok: true, settings: updated });
}
