/**
 * GET /api/diagnostics/design/[id]
 *
 * v41 — diagnostic endpoint that returns a HUMAN-READABLE summary of
 * what's actually stored in the DB for a design. Use it to debug
 * "my logos disappeared" reports without requiring SQL access.
 *
 * Returns:
 *   {
 *     id, name, isDefault, isArchived,
 *     backgroundColor, backgroundImageUrl,
 *     coverAssetCount, coverAssets: [{name, hasUrl, urlPrefix, hasDataUrl, x, y, scale, ...}, ...]
 *     pageWatermarkCount, pageWatermarks: [...],
 *     updatedAt, createdAt,
 *   }
 *
 * Auth: requires session + companyId scope (same as the regular GET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeAsset(raw: any) {
  if (!raw || typeof raw !== 'object') {
    return { invalid: true, raw };
  }
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === 'string' ? r.url : null;
  const dataUrl = typeof r.dataUrl === 'string' ? r.dataUrl : null;
  return {
    name: r.name ?? null,
    hasUrl: !!url,
    urlPrefix: url ? url.slice(0, 80) : null,
    hasDataUrl: !!dataUrl,
    dataUrlSize: dataUrl ? dataUrl.length : 0,
    x: r.x ?? null,
    y: r.y ?? null,
    scale: r.scale ?? null,
    rotation: r.rotation ?? null,
    opacity: r.opacity ?? null,
    invert: r.invert ?? false,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }

  const design = await prisma.design.findFirst({
    where: { id, companyId: session.companyId },
    select: {
      id: true,
      name: true,
      isDefault: true,
      isArchived: true,
      backgroundColor: true,
      backgroundImageUrl: true,
      assetsJson: true,
      pageWatermarksJson: true,
      quoteText: true,
      previewPngUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!design) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const coverAssetsRaw = Array.isArray(design.assetsJson)
    ? design.assetsJson
    : [];
  const pageWatermarksRaw = Array.isArray(design.pageWatermarksJson)
    ? design.pageWatermarksJson
    : [];

  return NextResponse.json({
    id: design.id,
    name: design.name,
    isDefault: design.isDefault,
    isArchived: design.isArchived,
    backgroundColor: design.backgroundColor,
    backgroundImageUrl: design.backgroundImageUrl,
    quoteText: design.quoteText,
    previewPngUrl: design.previewPngUrl,
    coverAssetCount: coverAssetsRaw.length,
    coverAssets: coverAssetsRaw.map(summarizeAsset),
    pageWatermarkCount: pageWatermarksRaw.length,
    pageWatermarks: pageWatermarksRaw.map(summarizeAsset),
    rawAssetsJsonType: typeof design.assetsJson,
    rawPageWatermarksJsonType: typeof design.pageWatermarksJson,
    createdAt: design.createdAt.toISOString(),
    updatedAt: design.updatedAt.toISOString(),
  });
}
