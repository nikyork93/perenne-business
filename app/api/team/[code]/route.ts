import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildDesignSnapshot } from '@/lib/design';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

/**
 * GET /api/team/[code]
 *
 * Public endpoint for iOS Perenne Note → team code activation.
 *
 * v33: NotebookCode now supports manual codes (orderId=null,
 * designId set directly). Lookup priority:
 *   1. NotebookCode (manual + Stripe)
 *      - Uses NotebookCode.designId directly if set (manual codes)
 *      - Falls back to NotebookCode.order.designSnapshotJson (Stripe)
 *      - Falls back to company defaults
 *   2. LegacyTeamCode (KV migration codes — being phased out)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  let codeInput = '';
  try {
    const { code: rawCode } = await params;
    codeInput = (rawCode ?? '').trim().toUpperCase();
  } catch (err) {
    console.error('[/api/team] params parse failed', err);
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!/^[A-Z0-9-]{1,64}$/i.test(codeInput)) {
    return NextResponse.json(
      { error: 'Invalid code format.' },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  // 1. NotebookCode lookup (handles BOTH manual and Stripe codes)
  try {
    const notebook = await prisma.notebookCode.findUnique({
      where: { code: codeInput },
      select: {
        status: true,
        company: {
          select: {
            name: true,
            logoSymbolUrl: true,
            logoExtendedUrl: true,
            primaryColor: true,
          },
        },
        // direct design link (manual codes)
        design: {
          select: {
            name: true,
            isArchived: true,
            backgroundColor: true,
            backgroundImageUrl: true,
            assetsJson: true,
            pageWatermarksJson: true,
            quoteText: true,
            quotePosition: true,
            quoteColor: true,
            previewPngUrl: true,
          },
        },
        // fallback through Order (Stripe codes — frozen snapshot)
        order: {
          select: { designSnapshotJson: true },
        },
      },
    });

    if (notebook) {
      if (notebook.status === 'REVOKED') {
        return NextResponse.json(
          { error: 'Code revoked.' },
          { status: 410, headers: CACHE_HEADERS }
        );
      }

      // Build snapshot:
      //   manual code -> live snapshot from referenced Design
      //   Stripe code -> frozen snapshot from Order
      //   neither -> null (iOS will show defaults)
      let snapshot: Prisma.JsonValue | null = null;
      let designName: string | null = null;
      let designArchived = false;

      if (notebook.design) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          snapshot = buildDesignSnapshot(notebook.design as any);
          designName = notebook.design.name;
          designArchived = notebook.design.isArchived;
        } catch (err) {
          console.error('[/api/team] buildDesignSnapshot failed', err);
        }
      } else if (notebook.order?.designSnapshotJson) {
        snapshot = notebook.order.designSnapshotJson;
      }

      const quote = extractQuote(snapshot);

      return NextResponse.json(
        {
          company: notebook.company.name,
          logoURL: notebook.company.logoSymbolUrl,
          logoExtendedURL: notebook.company.logoExtendedUrl,
          logoWhiteURL: null,
          colors: notebook.company.primaryColor
            ? { primary: notebook.company.primaryColor, secondary: null }
            : null,
          quote,
          seats: null,
          expires: null,
          design: snapshot
            ? { name: designName, archived: designArchived, snapshot }
            : null,
        },
        { headers: CACHE_HEADERS }
      );
    }
  } catch (err) {
    console.error('[/api/team] notebookCode lookup failed', err);
  }

  // 2. LegacyTeamCode lookup (kept for back-compat with imported KV codes)
  try {
    const legacy = await prisma.legacyTeamCode.findUnique({
      where: { code: codeInput },
      select: {
        label: true,
        manualCompanyName: true,
        manualLogoUrl: true,
        manualLogoExtUrl: true,
        manualLogoWhiteUrl: true,
        manualPrimaryColor: true,
        manualQuote: true,
        seats: true,
        expiresAt: true,
        isActive: true,
      },
    });

    if (legacy) {
      if (!legacy.isActive) {
        return NextResponse.json(
          { error: 'Code inactive.' },
          { status: 410, headers: CACHE_HEADERS }
        );
      }
      if (legacy.expiresAt && legacy.expiresAt < new Date()) {
        return NextResponse.json(
          { error: 'Code expired.' },
          { status: 410, headers: CACHE_HEADERS }
        );
      }
      return NextResponse.json(
        {
          company: legacy.manualCompanyName ?? legacy.label ?? 'Perenne Team',
          logoURL: legacy.manualLogoUrl ?? null,
          logoExtendedURL: legacy.manualLogoExtUrl ?? null,
          logoWhiteURL: legacy.manualLogoWhiteUrl ?? null,
          colors: legacy.manualPrimaryColor
            ? { primary: legacy.manualPrimaryColor, secondary: null }
            : null,
          quote: legacy.manualQuote ?? null,
          seats: legacy.seats,
          expires: legacy.expiresAt ? legacy.expiresAt.toISOString() : null,
          design: null,
        },
        { headers: CACHE_HEADERS }
      );
    }
  } catch (err) {
    console.error('[/api/team] legacyTeamCode lookup failed', err);
  }

  return NextResponse.json(
    { error: 'Invalid team code' },
    { status: 404, headers: CACHE_HEADERS }
  );
}

function extractQuote(snapshot: Prisma.JsonValue | null): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (snapshot as any).quote;
  return q?.text ?? null;
}
