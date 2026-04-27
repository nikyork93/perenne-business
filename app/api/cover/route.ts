import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { hmacSign } from '@/lib/crypto';

export const runtime = 'nodejs';

const assetSchema = z.object({
  name: z.string().max(200),
  url: z.string().url().optional(),
  dataUrl: z.string().optional(),
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(2),
  scale: z.number().min(0.01).max(10),
  rotation: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1),
});

const bodySchema = z.object({
  version: z.number().int().min(1),
  canvas: z.object({ width: z.number().int(), height: z.number().int() }),
  cover: z.object({
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    assets: z.array(assetSchema).max(20),
    quote: z
      .object({
        text: z.string().max(500),
        position: z.enum(['top', 'center', 'bottom']),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })
      .optional(),
  }),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // OWNER, ADMIN, or SUPERADMIN can save cover configs
  if (!['OWNER', 'ADMIN', 'SUPERADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  let parsed;
  try {
    const body = await req.json();
    const result = bodySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid cover config', details: result.error.flatten() },
        { status: 400 }
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Strip dataUrl from assets before persisting — only URLs go to DB.
  // Assets with only dataUrl (not uploaded yet) will be skipped with a warning.
  const cleanAssets = parsed.cover.assets
    .filter((a) => a.url) // must have persistent URL
    .map(({ dataUrl: _dataUrl, ...rest }) => rest);

  const skipped = parsed.cover.assets.length - cleanAssets.length;

  const companyId = session.companyId;

  const savedConfig = await prisma.$transaction(async (tx) => {
    // Find current version number
    const latest = await tx.coverConfig.findFirst({
      where: { companyId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    // Deactivate all previous configs
    await tx.coverConfig.updateMany({
      where: { companyId, isActive: true },
      data: { isActive: false },
    });

    // Create new active version
    const created = await tx.coverConfig.create({
      data: {
        companyId,
        version: nextVersion,
        isActive: true,
        backgroundColor: parsed.cover.backgroundColor,
        assetsJson: cleanAssets,
        quoteText: parsed.cover.quote?.text ?? null,
        quotePosition: parsed.cover.quote?.position ?? 'bottom',
        quoteColor: parsed.cover.quote?.color ?? '#ffffff',
      },
    });

    await tx.auditLog.create({
      data: {
        companyId,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'cover.saved',
        targetType: 'CoverConfig',
        targetId: created.id,
        metadata: { version: nextVersion, assets: cleanAssets.length },
      },
    });

    return created;
  });

  // Fire-and-forget: sync Company config to Worker KV for iOS
  syncCompanyToWorker(companyId).catch((e) =>
    console.error('Worker sync failed (non-blocking):', e)
  );

  return NextResponse.json({
    ok: true,
    config: savedConfig,
    warnings: skipped > 0
      ? [`${skipped} asset(s) skipped — pending upload to R2.`]
      : undefined,
  });
}

// ─── Worker KV sync helper ────────────────────────────────────

async function syncCompanyToWorker(companyId: string) {
  if (!env.PERENNE_API_SECRET) return;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      coverConfigs: {
        where: { isActive: true },
        take: 1,
        orderBy: { version: 'desc' },
      },
    },
  });
  if (!company) return;

  const cover = company.coverConfigs[0];
  const payload = {
    companyId,
    company: {
      name: company.name,
      logoSymbolUrl: company.logoSymbolUrl,
      logoExtendedUrl: company.logoExtendedUrl,
      cover: cover
        ? {
            backgroundColor: cover.backgroundColor,
            assets: cover.assetsJson,
            quote: cover.quoteText
              ? {
                  text: cover.quoteText,
                  position: cover.quotePosition,
                  color: cover.quoteColor,
                }
              : null,
          }
        : null,
    },
  };

  const timestamp = String(Date.now());
  const signature = hmacSign(`${timestamp}:${companyId}`, env.PERENNE_API_SECRET);

  await fetch(`${env.PERENNE_API_URL}/companies/sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-perenne-signature': signature,
      'x-perenne-timestamp': timestamp,
    },
    body: JSON.stringify(payload),
  });
}
