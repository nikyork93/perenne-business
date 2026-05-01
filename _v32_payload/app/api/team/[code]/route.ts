import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
 * Public endpoint for iOS app team-code activation.
 * iOS calls: GET https://business.perenne.app/api/team/{CODE}
 *
 * Lookup priority:
 *   1. NotebookCode (Stripe-issued via /store)
 *   2. LegacyTeamCode (manual, from /admin/legacy-codes)
 *
 * v32: maxDuration=30s for Neon cold starts, full try/catch around
 * each Prisma call, no relation join issues.
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

  // 1. NotebookCode lookup
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
      const snapshot = notebook.order?.designSnapshotJson ?? null;
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
          design: snapshot ? { name: null, archived: false, snapshot } : null,
        },
        { headers: CACHE_HEADERS }
      );
    }
  } catch (err) {
    console.error('[/api/team] notebookCode lookup failed', err);
    // continue to legacy lookup
  }

  // 2. LegacyTeamCode lookup
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
    return NextResponse.json(
      {
        error: 'Database error.',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
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
