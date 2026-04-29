import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { CoverAssetRef } from '@/types/cover';

/**
 * POST /api/cover
 *
 * Saves a new active version of CoverConfig for the current user's company.
 * Marks all previous versions inactive.
 *
 * Body shape — TWO scopes supported:
 *
 *   { scope: 'cover', cover: {...}, canvas?: {...}, version?: number }
 *     → updates cover fields, preserves existing pageWatermarks
 *
 *   { scope: 'pageWatermarks', pageWatermarks: [...] }
 *     → updates watermarks, preserves existing cover
 *
 * For backward compatibility, body without `scope` is treated as { scope: 'cover' }
 * and reads cover from `body.cover`.
 *
 * Response: { config: { version }, warnings?: string[] }
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

  // Validate per scope
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

  // ── Load current active config to preserve unchanged scope ──
  const current = await prisma.coverConfig.findFirst({
    where: { companyId, isActive: true },
    orderBy: { version: 'desc' },
  });

  const currentExtra = current as unknown as {
    backgroundImageUrl?: string | null;
    pageWatermarksJson?: unknown;
  } | null;

  // ── Build merged data based on scope ──
  const warnings: string[] = [];

  let backgroundColor: string;
  let backgroundImageUrl: string | null;
  let assetsJson: object;
  let quoteText: string | null;
  let quotePosition: string | null;
  let quoteColor: string | null;
  let pageWatermarksJson: object | null;

  if (scope === 'cover' && body.cover) {
    backgroundColor = body.cover.backgroundColor;
    backgroundImageUrl = body.cover.backgroundImageUrl ?? null;
    assetsJson = body.cover.assets as unknown as object;
    quoteText = body.cover.quote?.text ?? null;
    quotePosition = body.cover.quote?.position ?? null;
    quoteColor = body.cover.quote?.color ?? null;
    // Preserve watermarks from current
    pageWatermarksJson = (currentExtra?.pageWatermarksJson as object | null) ?? null;

    // Warnings
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
    // scope === 'pageWatermarks': preserve cover from current, update watermarks
    if (!current) {
      return NextResponse.json(
        { error: 'No existing cover config — save the cover first.' },
        { status: 400 }
      );
    }
    backgroundColor = current.backgroundColor;
    backgroundImageUrl = currentExtra?.backgroundImageUrl ?? null;
    assetsJson = (current.assetsJson as unknown as object) ?? [];
    quoteText = current.quoteText;
    quotePosition = current.quotePosition;
    quoteColor = current.quoteColor;
    pageWatermarksJson = (body.pageWatermarks ?? []) as unknown as object;

    const missingUrls = (body.pageWatermarks ?? []).filter((w) => !w.url);
    if (missingUrls.length > 0) {
      warnings.push(
        `${missingUrls.length} watermark(s) without persistent URL — re-upload before iOS sync.`
      );
    }
  }

  // ── Compute next version, deactivate old, create new ──
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

  const created = await prisma.coverConfig.create({
    data: {
      companyId,
      version: nextVersion,
      backgroundColor,
      backgroundImageUrl,
      assetsJson,
      quoteText,
      quotePosition,
      quoteColor,
      pageWatermarksJson,
      isActive: true,
    } as unknown as Parameters<typeof prisma.coverConfig.create>[0]['data'],
  });

  await prisma.auditLog.create({
    data: {
      companyId,
      actorEmail: session.email,
      action: scope === 'pageWatermarks' ? 'cover.watermarks_saved' : 'cover.saved',
      details: { version: nextVersion, scope } as unknown as object,
    },
  });

  return NextResponse.json({
    config: { version: created.version },
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
