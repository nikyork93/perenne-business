import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { ascSyncRecent } from '@/lib/integrations/asc';
import { firebaseSyncRecent } from '@/lib/integrations/firebase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  source: z.enum(['asc', 'firebase', 'all']),
  days: z.coerce.number().int().min(1).max(120).default(30),
});

/**
 * Trigger an analytics sync. Super-admin only.
 *
 * Hits the upstream API (App Store Connect / GA4 Data API), writes
 * fresh AnalyticsSnapshot rows, and returns counts. Idempotent —
 * rows are upserted by (source, metric, date) so re-syncing the same
 * window just refreshes the cache.
 *
 * Run manually from the analytics page, or wire to a cron later.
 */
export async function POST(req: NextRequest) {
  await requireRole('SUPERADMIN');

  let payload: z.infer<typeof bodySchema>;
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
    }
    payload = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const settings = await prisma.adminSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  const result: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  if (payload.source === 'asc' || payload.source === 'all') {
    if (!settings.asc_keyId || !settings.asc_issuerId || !settings.asc_privateKey || !settings.asc_vendorId) {
      errors.asc = 'App Store Connect credentials are not configured.';
    } else {
      try {
        const r = await ascSyncRecent({
          keyId:        settings.asc_keyId,
          issuerId:     settings.asc_issuerId,
          privateKeyPem: settings.asc_privateKey,
          vendorId:     settings.asc_vendorId,
          appId:        settings.asc_appId ?? undefined,
        }, payload.days);
        result.asc = r;
      } catch (e) {
        errors.asc = e instanceof Error ? e.message : 'Unknown ASC error';
      }
    }
  }

  if (payload.source === 'firebase' || payload.source === 'all') {
    if (!settings.fb_serviceAccountJson || !settings.fb_propertyId) {
      errors.firebase = 'Firebase / GA4 credentials are not configured.';
    } else {
      try {
        const sa = JSON.parse(settings.fb_serviceAccountJson);
        const r = await firebaseSyncRecent({
          serviceAccount: sa,
          propertyId: settings.fb_propertyId,
        }, payload.days);
        result.firebase = r;
      } catch (e) {
        errors.firebase = e instanceof Error ? e.message : 'Unknown Firebase error';
      }
    }
  }

  const ok = Object.keys(errors).length === 0;
  return NextResponse.json({ ok, result, errors }, { status: ok ? 200 : 207 });
}
