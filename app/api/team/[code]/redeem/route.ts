import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildDesignSnapshot } from '@/lib/design';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Hobby cap is 60s; we set 30s so we fail fast and log clearly
// instead of getting killed mid-execution.
export const maxDuration = 30;

/**
 * POST /api/team/[code]/redeem  — v43
 *
 * v43 changes vs v42:
 *   - Detailed step-by-step logging (visible in Vercel Functions tab).
 *   - Per-query DB timeouts (5s) via Promise.race so a slow/blocked
 *     query can't stall the whole request.
 *   - 404 fast-fail for codes that obviously don't exist before we
 *     even hit Prisma.
 *
 * Status semantics (unchanged):
 *   200 OK            — code valid + first redemption (or idempotent retry)
 *   400 Bad Request   — malformed code
 *   404 Not Found     — no NotebookCode AND no LegacyTeamCode matches
 *   409 Conflict      — NotebookCode already CLAIMED by a different device
 *   410 Gone          — REVOKED / inactive / expired
 *   500 Internal      — DB timeout or unexpected exception (logged)
 */

const bodySchema = z.object({
  deviceId: z.string().min(1).max(128).optional(),
});

type ErrCode =
  | 'invalid_format'
  | 'invalid'
  | 'not_found'
  | 'already_redeemed'
  | 'server_error';

const errorBody = (errorCode: ErrCode, message: string) => ({
  error: errorCode,
  errorCode,
  message,
});

/**
 * Race a Prisma promise against a timeout. If the query takes longer
 * than `ms`, the returned promise rejects with a labelled Error so we
 * can log clearly in Vercel which DB call hung.
 */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`DB timeout after ${ms}ms: ${label}`)),
      ms
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const tStart = Date.now();
  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();
  const reqId = Math.random().toString(36).slice(2, 8);
  const log = (msg: string) =>
    console.log(`[redeem ${reqId}] ${msg} (+${Date.now() - tStart}ms)`);

  log(`START code=${code}`);

  if (!/^[A-Z0-9-]{1,64}$/i.test(code)) {
    log(`REJECT invalid_format`);
    return NextResponse.json(
      errorBody('invalid_format', 'Invalid code format.'),
      { status: 400 }
    );
  }

  // Body parsing — tolerate empty / non-JSON bodies.
  let deviceId: string | undefined;
  try {
    const raw = await req.json();
    const parsed = bodySchema.parse(raw);
    deviceId = parsed.deviceId;
    log(`body ok deviceId=${deviceId ? 'set' : 'none'}`);
  } catch {
    deviceId = undefined;
    log(`body none`);
  }

  const xff = req.headers.get('x-forwarded-for') ?? '';
  const ipAddress = xff.split(',')[0]?.trim() || null;

  // ─── 1. NotebookCode lookup ─────────────────────────────────────
  log(`looking up NotebookCode`);
  let notebookCode: Awaited<ReturnType<typeof findNotebookCode>>;
  try {
    notebookCode = await withTimeout(findNotebookCode(code), 5000, 'notebookCode.findUnique');
    log(`NotebookCode result: ${notebookCode ? 'FOUND status=' + notebookCode.status : 'null'}`);
  } catch (err) {
    log(`NotebookCode query FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      errorBody('server_error', 'Database error. Please retry.'),
      { status: 500 }
    );
  }

  if (notebookCode) {
    if (notebookCode.status === 'REVOKED') {
      log(`REVOKED → 410`);
      return NextResponse.json(errorBody('invalid', 'Code revoked.'), { status: 410 });
    }

    if (notebookCode.status === 'CLAIMED') {
      // Idempotency: same deviceId reclaim → echo success
      if (
        deviceId &&
        notebookCode.claimedDeviceId &&
        notebookCode.claimedDeviceId === deviceId
      ) {
        log(`CLAIMED idempotent retry from same device → 200`);
        return NextResponse.json(buildResponseFromNotebookCode(notebookCode, true));
      }
      log(`CLAIMED already → 409`);
      return NextResponse.json(
        errorBody('already_redeemed', 'Code already redeemed.'),
        { status: 409 }
      );
    }

    // AVAILABLE → claim it
    log(`AVAILABLE → claiming`);
    try {
      await withTimeout(
        prisma.notebookCode.update({
          where: { id: notebookCode.id },
          data: {
            status: 'CLAIMED',
            claimedAt: new Date(),
            claimedDeviceId: deviceId ?? null,
            claimedIpAddress: ipAddress,
          },
        }),
        5000,
        'notebookCode.update'
      );
      log(`CLAIMED → 200`);
    } catch (err) {
      log(`update FAILED: ${err instanceof Error ? err.message : String(err)}`);
      return NextResponse.json(
        errorBody('server_error', 'Could not claim code. Please retry.'),
        { status: 500 }
      );
    }

    return NextResponse.json(buildResponseFromNotebookCode(notebookCode, true));
  }

  // ─── 2. LegacyTeamCode lookup ───────────────────────────────────
  log(`looking up LegacyTeamCode`);
  let legacy: Awaited<ReturnType<typeof findLegacyCode>>;
  try {
    legacy = await withTimeout(findLegacyCode(code), 5000, 'legacyTeamCode.findUnique');
    log(`LegacyTeamCode result: ${legacy ? 'FOUND active=' + legacy.isActive : 'null'}`);
  } catch (err) {
    log(`LegacyTeamCode query FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      errorBody('server_error', 'Database error. Please retry.'),
      { status: 500 }
    );
  }

  if (legacy) {
    if (!legacy.isActive) {
      log(`legacy inactive → 410`);
      return NextResponse.json(errorBody('invalid', 'Code inactive.'), { status: 410 });
    }
    if (legacy.expiresAt && legacy.expiresAt < new Date()) {
      log(`legacy expired → 410`);
      return NextResponse.json(errorBody('invalid', 'Code expired.'), { status: 410 });
    }
    log(`legacy ok → 200`);
    return NextResponse.json(buildResponseFromLegacyCode(legacy));
  }

  // ─── 3. Not found ───────────────────────────────────────────────
  log(`not found → 404`);
  return NextResponse.json(errorBody('not_found', 'Invalid team code.'), { status: 404 });
}

// ─── Prisma queries split out so withTimeout can wrap them ──────────

function findNotebookCode(code: string) {
  return prisma.notebookCode.findUnique({
    where: { code },
    select: {
      id: true,
      status: true,
      claimedAt: true,
      claimedDeviceId: true,
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
}

function findLegacyCode(code: string) {
  return prisma.legacyTeamCode.findUnique({
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
}

// ─── Response builders ──────────────────────────────────────────────

function buildResponseFromNotebookCode(
  n: {
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
  },
  redeemed: boolean
) {
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
    redeemed,
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
  const companyName =
    l.manualCompanyName ?? l.company?.name ?? l.label ?? 'Perenne Team';
  const logoURL = l.manualLogoUrl ?? l.company?.logoSymbolUrl ?? null;
  const logoExtendedURL =
    l.manualLogoExtUrl ?? l.company?.logoExtendedUrl ?? null;
  const logoWhiteURL = l.manualLogoWhiteUrl ?? null;
  const primaryColor =
    l.manualPrimaryColor ?? l.company?.primaryColor ?? null;
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
    redeemed: true,
  };
}

function extractQuote(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (snapshot as any).quote;
  return q?.text ?? null;
}
