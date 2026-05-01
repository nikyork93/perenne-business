import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import type { DesignSnapshot } from '@/types/design';

export const runtime = 'nodejs';

/**
 * GET /api/internal/code-resolve/[code]
 *
 * Internal endpoint called by the Cloudflare Worker (api.perenne.app)
 * when an iOS user redeems a notebook code. Returns:
 *
 *   - companyName, companyLogoExtendedUrl  (homepage header data)
 *   - design snapshot from the code's order (cover + watermarks)
 *   - quote (legacy fallback also surfaced via design.quote)
 *   - status of the code (so the Worker can refuse REVOKED codes)
 *
 * Auth: HMAC-SHA256 signature of `${timestamp}:${code}` in the
 * x-perenne-signature header, with x-perenne-timestamp matching.
 * Same scheme used by /codes/sync (Worker→business direction).
 *
 * The Worker should cache the response in its KV with a short TTL
 * (~5 min) to avoid hammering this endpoint on every cover render.
 *
 * IMPORTANT — this is an INTERNAL contract between perenne-business
 * and the Cloudflare Worker. It is NOT consumed directly by iOS.
 * iOS will continue to call api.perenne.app/team/{CODE} (the Worker)
 * which will in turn call this endpoint when needed.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  // ── Verify HMAC ─────────────────────────────────────────────────
  if (!env.PERENNE_API_SECRET) {
    console.error('[code-resolve] PERENNE_API_SECRET not configured');
    return NextResponse.json({ error: 'Service misconfigured.' }, { status: 503 });
  }

  const sig = req.headers.get('x-perenne-signature') ?? '';
  const ts = req.headers.get('x-perenne-timestamp') ?? '';
  if (!sig || !ts) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 401 });
  }
  // Reject signatures older than 5 minutes (replay protection)
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Stale signature.' }, { status: 401 });
  }
  const expected = createHmac('sha256', env.PERENNE_API_SECRET)
    .update(`${ts}:${code}`)
    .digest('base64url');
  if (
    expected.length !== sig.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    return NextResponse.json({ error: 'Bad signature.' }, { status: 401 });
  }

  // ── Resolve code → snapshot ─────────────────────────────────────
  const normalised = code.trim().toUpperCase();
  const row = await prisma.notebookCode.findUnique({
    where: { code: normalised },
    select: {
      status: true,
      claimedAt: true,
      claimedDeviceId: true,
      company: {
        select: {
          name: true,
          slug: true,
          logoExtendedUrl: true,
          logoSymbolUrl: true,
          primaryColor: true,
        },
      },
      order: {
        select: {
          id: true,
          designId: true,
          designSnapshotJson: true,
          design: {
            select: {
              name: true,
              isArchived: true,
            },
          },
        },
      },
    },
  });

  if (!row) {
    return NextResponse.json({ error: 'Code not found.' }, { status: 404 });
  }

  if (row.status === 'REVOKED') {
    return NextResponse.json({ error: 'Code revoked.' }, { status: 410 });
  }

  // The frozen snapshot lives on the order. Pre-migration orders
  // (designSnapshotJson === null) are returned without a design block;
  // the Worker / iOS can fall back to its legacy "company branding only"
  // flow for those.
  const snapshot = (row.order?.designSnapshotJson ?? null) as DesignSnapshot | null;

  return NextResponse.json({
    code: normalised,
    status: row.status,
    claimed: row.status === 'CLAIMED',
    claimedAt: row.claimedAt?.toISOString() ?? null,
    claimedDeviceId: row.claimedDeviceId ?? null,
    company: {
      name: row.company.name,
      slug: row.company.slug,
      logoExtendedUrl: row.company.logoExtendedUrl ?? null,
      logoSymbolUrl: row.company.logoSymbolUrl ?? null,
      primaryColor: row.company.primaryColor ?? null,
    },
    design: snapshot
      ? {
          name: row.order?.design?.name ?? null,
          archived: row.order?.design?.isArchived ?? false,
          // The full snapshot is what iOS actually uses to render the
          // cover and the page watermarks. Self-contained — no further
          // fetches needed once cached in the Worker KV.
          snapshot,
        }
      : null,
  });
}
