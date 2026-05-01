import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildDesignSnapshot } from '@/lib/design';
import type { CoverAssetRef } from '@/types/cover';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';

// Edge-cache the response. The iOS app calls this once per device
// activation; subsequent re-fetches (background refresh, etc.) hit
// the CDN cache and skip our Postgres entirely.
//   s-maxage=3600           → CDN holds 1h
//   stale-while-revalidate  → serve stale up to 24h while we revalidate
// Companies that change branding will see propagation in ≤1h after
// any code is requested. For instant invalidation we'd need to bust
// the cache key on Design.update — out of scope here.
const CACHE_HEADERS = {
  'cache-control':
    'public, s-maxage=3600, stale-while-revalidate=86400',
};

/**
 * GET /api/team/[code]
 *
 * Public endpoint consumed by the iOS app (Perenne Note → Settings →
 * Team → Activate). Replaces the legacy Cloudflare Worker endpoint
 * `https://api.perenne.app/team/{CODE}` — DNS for api.perenne.app is
 * being repointed to Vercel, and the middleware rewrites
 * `api.perenne.app/team/*` to `/api/team/*` so the iOS app keeps
 * calling the same URL it always called.
 *
 * Lookup strategy:
 *
 *   1. NotebookCode (Stripe-issued via /store) — joins through Order
 *      to read the frozen designSnapshotJson + company branding.
 *   2. LegacyTeamCode (manual, from /admin/legacy-codes) — built from
 *      manual fields and/or referenced Design.
 *
 * Response shape mirrors the legacy TeamBrandConfig (so older iOS
 * builds keep parsing) plus a new `design` block carrying the full
 * snapshot for newer builds.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();

  // Basic format guard — codes are alphanumeric + dashes, no slashes
  // (slashes would mean someone is trying path traversal nonsense).
  if (!/^[A-Z0-9-]{1,64}$/i.test(code)) {
    return NextResponse.json(
      { error: 'Invalid code format.' },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  // ─── 1. Stripe-issued NotebookCode ──────────────────────────────
  const notebook = await prisma.notebookCode.findUnique({
    where: { code },
    select: {
      status: true,
      company: {
        select: {
          name: true,
          slug: true,
          logoSymbolUrl: true,
          logoExtendedUrl: true,
          primaryColor: true,
        },
      },
      order: {
        select: {
          designSnapshotJson: true,
          design: { select: { name: true, isArchived: true } },
        },
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
    return NextResponse.json(
      buildResponseFromNotebookCode(notebook),
      { headers: CACHE_HEADERS }
    );
  }

  // ─── 2. LegacyTeamCode ──────────────────────────────────────────
  const legacy = await prisma.legacyTeamCode.findUnique({
    where: { code },
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
      company: {
        select: {
          name: true,
          logoSymbolUrl: true,
          logoExtendedUrl: true,
          primaryColor: true,
        },
      },
      design: true,
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
      buildResponseFromLegacyCode(legacy),
      { headers: CACHE_HEADERS }
    );
  }

  // 404
  return NextResponse.json(
    { error: 'Invalid team code' },
    { status: 404, headers: CACHE_HEADERS }
  );
}

// ─── Response builders ───────────────────────────────────────────────

function buildResponseFromNotebookCode(n: {
  company: {
    name: string;
    slug: string;
    logoSymbolUrl: string | null;
    logoExtendedUrl: string | null;
    primaryColor: string | null;
  };
  order: {
    designSnapshotJson: Prisma.JsonValue | null;
    design: { name: string; isArchived: boolean } | null;
  } | null;
}) {
  const snapshot = n.order?.designSnapshotJson ?? null;
  return {
    company: n.company.name,
    logoURL: n.company.logoSymbolUrl,
    logoExtendedURL: n.company.logoExtendedUrl,
    logoWhiteURL: null,
    colors: n.company.primaryColor
      ? { primary: n.company.primaryColor, secondary: null }
      : null,
    quote: extractQuote(snapshot),
    seats: null,
    expires: null,
    design: snapshot
      ? {
          name: n.order?.design?.name ?? null,
          archived: n.order?.design?.isArchived ?? false,
          snapshot,
        }
      : null,
  };
}

function buildResponseFromLegacyCode(l: {
  label: string | null;
  manualCompanyName: string | null;
  manualLogoUrl: string | null;
  manualLogoExtUrl: string | null;
  manualLogoWhiteUrl: string | null;
  manualPrimaryColor: string | null;
  manualQuote: string | null;
  seats: number | null;
  expiresAt: Date | null;
  company: {
    name: string;
    logoSymbolUrl: string | null;
    logoExtendedUrl: string | null;
    primaryColor: string | null;
  } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  design: any | null;
}) {
  // Resolve fields with this priority (manual > company-link > null):
  //   - manual fields override everything (admin can hand-edit)
  //   - if a Company is linked, fall back to company.* fields
  //   - otherwise null
  const companyName =
    l.manualCompanyName ?? l.company?.name ?? l.label ?? 'Perenne Team';
  const logoURL = l.manualLogoUrl ?? l.company?.logoSymbolUrl ?? null;
  const logoExtendedURL =
    l.manualLogoExtUrl ?? l.company?.logoExtendedUrl ?? null;
  const logoWhiteURL = l.manualLogoWhiteUrl ?? null;
  const primaryColor = l.manualPrimaryColor ?? l.company?.primaryColor ?? null;
  const quote = l.manualQuote ?? null;

  const snapshot = l.design ? buildDesignSnapshot(l.design) : null;

  return {
    company: companyName,
    logoURL,
    logoExtendedURL,
    logoWhiteURL,
    colors: primaryColor ? { primary: primaryColor, secondary: null } : null,
    quote,
    seats: l.seats,
    expires: l.expiresAt ? l.expiresAt.toISOString() : null,
    design: snapshot
      ? { name: l.design.name ?? null, archived: false, snapshot }
      : null,
  };
}

function extractQuote(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (snapshot as any).quote;
  return q?.text ?? null;
}

// Reference avoid TS unused warning (CoverAssetRef is part of the
// snapshot shape — kept here so callers' tsc sees the dependency).
export type _CoverAssetRefRef = CoverAssetRef;
