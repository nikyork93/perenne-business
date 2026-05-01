import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { CoverAssetRef } from '@/types/cover';
import { getOrCreateDefaultDesign } from '@/lib/design';

/**
 * POST /api/cover  (LEGACY ENDPOINT, kept for backward-compat)
 *
 * Behaviour change in Session 1:
 * The endpoint now performs a DUAL-WRITE — it continues to write a
 * new active version of CoverConfig (so iOS, which still reads
 * CoverConfig, keeps working) AND mirrors the same content into the
 * company's DEFAULT Design (so the new design library is kept in
 * sync). Once the iOS migration ships in Session 3, the CoverConfig
 * branch can be retired.
 *
 * Body shape (unchanged):
 *
 *   { scope: 'cover', cover: {...}, canvas?: {...}, version?: number }
 *     → updates cover fields, preserves existing pageWatermarks
 *
 *   { scope: 'pageWatermarks', pageWatermarks: [...] }
 *     → updates watermarks, preserves existing cover
 *
 * Backward compat: body without `scope` is treated as { scope: 'cover' }
 * and reads cover from `body.cover`.
 *
 * Response: { config: { version }, design: { id }, warnings?: string[] }
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company associated with session.' }, { status: 400 });
  }
  if (session.role === 'VIEWER') {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }
  const companyId = session.companyId;

  let body: {
    scope?: 'cover' | 'pageWatermarks';
    cover?: {
      backgroundColor: string;
      backgroundImageUrl?: string;
      assets: CoverAssetRef[];
      quote?: { text: string; position: string; color: string };
    };
    pageWatermarks?: CoverAssetRef[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const scope = body.scope ?? 'cover';
  if (scope !== 'cover' && scope !== 'pageWatermarks') {
    return NextResponse.json(
      { error: 'scope must be "cover" or "pageWatermarks".' },
      { status: 400 }
    );
  }

  if (scope === 'cover') {
    if (!body.cover?.backgroundColor) {
      return NextResponse.json({ error: 'Missing cover.backgroundColor.' }, { status: 400 });
    }
    if (!Array.isArray(body.cover.assets)) {
      return NextResponse.json({ error: 'Missing or invalid cover.assets.' }, { status: 400 });
    }
  }
  if (scope === 'pageWatermarks') {
    if (!Array.isArray(body.pageWatermarks)) {
      return NextResponse.json(
        { error: 'pageWatermarks must be an array.' },
        { status: 400 }
      );
    }
  }

  // ── Load current state to preserve unchanged scope ──────────────
  const currentCfg = await prisma.coverConfig.findFirst({
    where: { companyId, isActive: true },
    orderBy: { version: 'desc' },
  });

  const currentExtra = currentCfg as unknown as {
    backgroundImageUrl?: string | null;
    pageWatermarksJson?: unknown;
  } | null;

  const warnings: string[] = [];

  let backgroundColor: string;
  let backgroundImageUrl: string | null;
  let assetsJson: CoverAssetRef[];
  let quoteText: string | null;
  let quotePosition: string | null;
  let quoteColor: string | null;
  let pageWatermarksJson: CoverAssetRef[] | null;

  if (scope === 'cover' && body.cover) {
    backgroundColor = body.cover.backgroundColor;
    backgroundImageUrl = body.cover.backgroundImageUrl ?? null;
    assetsJson = body.cover.assets;
    quoteText = body.cover.quote?.text ?? null;
    quotePosition = body.cover.quote?.position ?? null;
    quoteColor = body.cover.quote?.color ?? null;
    pageWatermarksJson =
      ((currentExtra?.pageWatermarksJson ?? null) as CoverAssetRef[] | null) ?? null;

    const missingUrls = body.cover.assets.filter((a) => !a.url);
    if (missingUrls.length > 0) {
      warnings.push(
        `${missingUrls.length} asset(s) without persistent URL — re-upload before iOS sync.`
      );
    }
    if (
      body.cover.backgroundImageUrl &&
      !body.cover.backgroundImageUrl.startsWith('http')
    ) {
      warnings.push('Background image is not yet uploaded — re-save once upload completes.');
    }
  } else {
    if (!currentCfg) {
      return NextResponse.json(
        { error: 'No existing cover config — save the cover first.' },
        { status: 400 }
      );
    }
    backgroundColor = currentCfg.backgroundColor;
    backgroundImageUrl = currentExtra?.backgroundImageUrl ?? null;
    assetsJson = (currentCfg.assetsJson as unknown as CoverAssetRef[]) ?? [];
    quoteText = currentCfg.quoteText;
    quotePosition = currentCfg.quotePosition;
    quoteColor = currentCfg.quoteColor;
    pageWatermarksJson = (body.pageWatermarks ?? []) as CoverAssetRef[];

    const missingUrls = (body.pageWatermarks ?? []).filter((w) => !w.url);
    if (missingUrls.length > 0) {
      warnings.push(
        `${missingUrls.length} watermark(s) without persistent URL — re-upload before iOS sync.`
      );
    }
  }

  // ── Write 1/2: legacy CoverConfig (new active version) ──────────
  const latest = await prisma.coverConfig.findFirst({
    where: { companyId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  await prisma.coverConfig.updateMany({
    where: { companyId, isActive: true },
    data: { isActive: false },
  });

  const createdConfig = await prisma.coverConfig.create({
    data: {
      companyId,
      version: nextVersion,
      backgroundColor,
      backgroundImageUrl,
      assetsJson: assetsJson as unknown as Prisma.InputJsonValue,
      quoteText,
      quotePosition,
      quoteColor,
      pageWatermarksJson:
        pageWatermarksJson as unknown as Prisma.InputJsonValue | null,
      isActive: true,
    } as unknown as Parameters<typeof prisma.coverConfig.create>[0]['data'],
  });

  // ── Write 2/2: default Design (mirror same content) ─────────────
  // Lazily creates the Default design if the company doesn't have one
  // yet (e.g. companies onboarded before the migration ran).
  const defaultDesign = await getOrCreateDefaultDesign(companyId);
  const updatedDesign = await prisma.design.update({
    where: { id: defaultDesign.id },
    data: {
      backgroundColor,
      backgroundImageUrl,
      assetsJson: assetsJson as unknown as Prisma.InputJsonValue,
      pageWatermarksJson:
        (pageWatermarksJson ?? []) as unknown as Prisma.InputJsonValue,
      quoteText,
      quotePosition,
      quoteColor,
    },
  });

  await prisma.auditLog.create({
    data: {
      companyId,
      actorEmail: session.email,
      actorRole: session.role,
      action: scope === 'pageWatermarks' ? 'cover.watermarks_saved' : 'cover.saved',
      metadata: {
        version: nextVersion,
        scope,
        designId: updatedDesign.id,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    config: { version: createdConfig.version },
    design: { id: updatedDesign.id, name: updatedDesign.name },
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
