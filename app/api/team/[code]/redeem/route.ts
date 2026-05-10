import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildDesignSnapshot } from '@/lib/design';
import type { Prisma, Design as PrismaDesign } from '@prisma/client';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/team/[code]/redeem  — v44
 *
 * v44 changes vs v43:
 *   - Resolves the design from THREE possible sources, in priority:
 *     1. NotebookCode.design (manual codes from /admin/codes/batch
 *        with an explicit designId set). Built fresh via
 *        buildDesignSnapshot at read time.
 *     2. Order.designSnapshotJson (Stripe codes — frozen at checkout).
 *     3. Order.design (Stripe codes whose snapshot was never built —
 *        legacy / pre-Session-3 orders). Built fresh.
 *   - This means SUPERADMIN-issued batches (orderId=null, designId set
 *     directly on the code) now correctly return their design payload,
 *     not just `null`.
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

  let deviceId: string | undefined;
  try {
    const raw = await req.json();
    deviceId = bodySchema.parse(raw).deviceId;
    log(`body ok deviceId=${deviceId ? 'set' : 'none'}`);
  } catch {
    log(`body none`);
  }

  const xff = req.headers.get('x-forwarded-for') ?? '';
  const ipAddress = xff.split(',')[0]?.trim() || null;

  // ─── 1. NotebookCode lookup ─────────────────────────────────────
  //
  // We pull all three possible design sources in one query:
  //   • notebook.design       — direct designId on the code (manual batches)
  //   • notebook.order.designSnapshotJson — frozen at checkout
  //   • notebook.order.design — fresh design referenced by the order
  // The redeemer below picks whichever is present, in that priority.
  log(`looking up NotebookCode`);
  let notebookCode: Awaited<ReturnType<typeof findNotebookCode>>;
  try {
    notebookCode = await withTimeout(findNotebookCode(code), 5000, 'notebookCode.findUnique');
    log(`NotebookCode result: ${notebookCode ? 'FOUND status=' + notebookCode.status : 'null'}`);
  } catch (err) {
    log(`NotebookCode query FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(errorBody('server_error', 'Database error.'), { status: 500 });
  }

  if (notebookCode) {
    if (notebookCode.status === 'REVOKED') {
      log(`REVOKED → 410`);
      return NextResponse.json(errorBody('invalid', 'Code revoked.'), { status: 410 });
    }

    if (notebookCode.status === 'CLAIMED') {
      if (
        deviceId &&
        notebookCode.claimedDeviceId &&
        notebookCode.claimedDeviceId === deviceId
      ) {
        log(`CLAIMED idempotent retry → 200`);
        return NextResponse.json(buildResponseFromNotebookCode(notebookCode, true));
      }
      log(`CLAIMED already → 409`);
      return NextResponse.json(
        errorBody('already_redeemed', 'Code already redeemed.'),
        { status: 409 }
      );
    }

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
      return NextResponse.json(errorBody('server_error', 'Could not claim code.'), { status: 500 });
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
    return NextResponse.json(errorBody('server_error', 'Database error.'), { status: 500 });
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

  log(`not found → 404`);
  return NextResponse.json(errorBody('not_found', 'Invalid team code.'), { status: 404 });
}

// ─── Prisma queries ─────────────────────────────────────────────────

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
      // v44 — direct design link (manual batches via /admin/codes)
      design: true,
      // v44 — order's frozen snapshot AND fresh design as fallback
      order: {
        select: {
          designSnapshotJson: true,
          design: true,
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

/**
 * Resolve the design payload from one of three sources, in priority:
 *   1. notebookCode.design — direct link from /admin/codes/batch
 *   2. order.designSnapshotJson — frozen Stripe checkout snapshot
 *   3. order.design — fresh design (legacy orders without a snapshot)
 * Returns null if none of the above carry usable design data.
 */
function resolveDesignPayload(n: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  design?: PrismaDesign | null;
  order?: {
    designSnapshotJson: Prisma.JsonValue | null;
    design: PrismaDesign | null;
  } | null;
}): { name: string | null; archived: boolean; snapshot: unknown } | null {
  // 1. Direct designId on the NotebookCode
  if (n.design) {
    return {
      name: n.design.name,
      archived: n.design.isArchived,
      snapshot: buildDesignSnapshot(n.design),
    };
  }
  // 2. Frozen Order snapshot
  const frozen = n.order?.designSnapshotJson;
  if (frozen) {
    return {
      name: n.order?.design?.name ?? null,
      archived: n.order?.design?.isArchived ?? false,
      snapshot: frozen,
    };
  }
  // 3. Order's live design
  if (n.order?.design) {
    return {
      name: n.order.design.name,
      archived: n.order.design.isArchived,
      snapshot: buildDesignSnapshot(n.order.design),
    };
  }
  return null;
}

function buildResponseFromNotebookCode(
  n: {
    company: {
      name: string;
      slug: string;
      logoSymbolUrl: string | null;
      logoExtendedUrl: string | null;
      primaryColor: string | null;
    };
    design?: PrismaDesign | null;
    order?: {
      designSnapshotJson: Prisma.JsonValue | null;
      design: PrismaDesign | null;
    } | null;
  },
  redeemed: boolean
) {
  const design = resolveDesignPayload(n);
  return {
    company: n.company.name,
    logoURL: n.company.logoSymbolUrl,
    logoExtendedURL: n.company.logoExtendedUrl,
    logoWhiteURL: null,
    colors: n.company.primaryColor
      ? { primary: n.company.primaryColor, secondary: null }
      : null,
    quote: extractQuote(design?.snapshot),
    seats: null,
    expires: null,
    design,
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
