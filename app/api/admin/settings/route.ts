import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Platform-level settings, super-admin only. Backed by the singleton
 * AdminSettings row (id = "default").
 *
 * Currently stores:
 *   • Bank transfer details (shown in Store popup + invoices)
 *   • App Store Connect API credentials (Sales Reports)
 *   • Firebase service-account JSON + GA4 property id
 *
 * GET returns the row WITH secrets redacted unless ?include=secrets
 * is set, so we can show truncated previews in the UI without bleeding
 * private keys into client bundles.
 */
const bodySchema = z.object({
  // Bank
  bankBeneficiary: z.string().trim().max(200).nullable().optional().or(z.literal('')),
  bankAddress:     z.string().trim().max(300).nullable().optional().or(z.literal('')),
  bankVat:         z.string().trim().max(50).nullable().optional().or(z.literal('')),
  bankName:        z.string().trim().max(200).nullable().optional().or(z.literal('')),
  bankIban:        z.string().trim().max(50).nullable().optional().or(z.literal('')),
  bankBic:         z.string().trim().max(20).nullable().optional().or(z.literal('')),
  bankNotice:      z.string().trim().max(1000).nullable().optional().or(z.literal('')),

  // App Store Connect
  asc_keyId:       z.string().trim().max(20).nullable().optional().or(z.literal('')),
  asc_issuerId:    z.string().trim().max(80).nullable().optional().or(z.literal('')),
  asc_privateKey:  z.string().trim().max(5000).nullable().optional().or(z.literal('')),
  asc_appId:       z.string().trim().max(40).nullable().optional().or(z.literal('')),
  asc_vendorId:    z.string().trim().max(40).nullable().optional().or(z.literal('')),

  // Firebase
  fb_serviceAccountJson: z.string().trim().max(10000).nullable().optional().or(z.literal('')),
  fb_propertyId:         z.string().trim().max(40).nullable().optional().or(z.literal('')),
});

const ALL_KEYS = [
  'bankBeneficiary', 'bankAddress', 'bankVat', 'bankName', 'bankIban', 'bankBic', 'bankNotice',
  'asc_keyId', 'asc_issuerId', 'asc_privateKey', 'asc_appId', 'asc_vendorId',
  'fb_serviceAccountJson', 'fb_propertyId',
] as const;

function redact(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return '••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  await requireRole('SUPERADMIN');
  const includeSecrets = req.nextUrl.searchParams.get('include') === 'secrets';

  const row = await prisma.adminSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  if (includeSecrets) {
    return NextResponse.json({ ok: true, settings: row });
  }

  // Redact secrets in the default response
  return NextResponse.json({
    ok: true,
    settings: {
      ...row,
      asc_privateKey: row.asc_privateKey ? `••• ${row.asc_privateKey.length} chars stored` : null,
      asc_keyId:      redact(row.asc_keyId),
      fb_serviceAccountJson: row.fb_serviceAccountJson ? `••• ${row.fb_serviceAccountJson.length} chars stored` : null,
    },
  });
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

  const data: Record<string, string | null | undefined> = { updatedByEmail: session.email };
  for (const key of ALL_KEYS) {
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

  return NextResponse.json({ ok: true, settings: { id: updated.id, updatedAt: updated.updatedAt } });
}
