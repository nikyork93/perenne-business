import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildDesignSnapshot } from '@/lib/design';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/team/[code]/redeem
 *
 * One-shot activation endpoint consumed by Perenne Note iOS (v2.0+).
 *
 * Differences vs the existing GET /api/team/[code]:
 *   - GET is read-only and CDN-cached; safe for legacy clients to
 *     poll. It does NOT mutate any code.
 *   - POST /redeem mutates the NotebookCode by setting
 *     status=CLAIMED + claimedAt + claimedDeviceId. Subsequent POST
 *     attempts on the SAME code return 409.
 *
 * Status semantics:
 *   200 OK            — code valid + first redemption: returns the same
 *                       payload as GET, with redeemed=true.
 *   400 Bad Request   — malformed code or invalid body.
 *   404 Not Found     — no NotebookCode and no LegacyTeamCode matches.
 *   409 Conflict      — NotebookCode already CLAIMED (one-shot rule).
 *                       Body: { error: 'already_redeemed', errorCode: 'already_redeemed' }
 *   410 Gone          — NotebookCode REVOKED, LegacyTeamCode inactive,
 *                       or LegacyTeamCode expired. Body:
 *                       { error: 'invalid', errorCode: 'invalid' }
 *
 * The response body uses `errorCode` as a stable key the iOS app
 * looks up in its localized strings table — never localize the key
 * itself, only the user-facing message via Localizable.strings.
 *
 * LegacyTeamCode behaviour:
 *   Legacy codes (admin-created, multi-redemption by design — used
 *   for trade shows / partner programs) are NOT marked CLAIMED on
 *   redeem. They remain re-resolvable. Client-side, the iOS app
 *   refuses to create a second notebook for the same code, so the
 *   user-perceived rule "one code = one notebook" is preserved.
 */

const bodySchema = z.object({
  /** iOS identifierForVendor (UUID). Used for tracking, not auth. */
  deviceId: z.string().min(1).max(128).optional(),
});

const errorBody = (
  errorCode:
    | 'invalid_format'
    | 'invalid'
    | 'not_found'
    | 'already_redeemed',
  message: string
) => ({ error: errorCode, errorCode, message });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9-]{1,64}$/i.test(code)) {
    return NextResponse.json(
      errorBody('invalid_format', 'Invalid code format.'),
      { status: 400 }
    );
  }

  // Body is optional; tolerate empty / non-JSON bodies. Older iOS
  // builds shipped before deviceId tracking should still be able to
  // redeem; we just won't have a device id to record.
  let deviceId: string | undefined;
  try {
    const raw = await req.json();
    const parsed = bodySchema.parse(raw);
    deviceId = parsed.deviceId;
  } catch {
    deviceId = undefined;
  }

  // Capture caller IP for audit. x-forwarded-for is set by Vercel's
  // edge proxy. Take the first hop since downstream entries can be
  // spoofed by clients.
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const ipAddress = xff.split(',')[0]?.trim() || null;

  // ─── 1. NotebookCode (Stripe-issued, paid, one-shot) ────────────
  const notebookCode = await prisma.notebookCode.findUnique({
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

  if (notebookCode) {
    if (notebookCode.status === 'REVOKED') {
      return NextResponse.json(
        errorBody('invalid', 'Code revoked.'),
        { status: 410 }
      );
    }

    if (notebookCode.status === 'CLAIMED') {
      // Already redeemed. Idempotency: if the SAME deviceId is
      // re-redeeming (e.g. iOS retried after network hiccup), return
      // 200 with the design payload again so the client can
      // recover. Different device → 409.
      if (
        deviceId &&
        notebookCode.claimedDeviceId &&
        notebookCode.claimedDeviceId === deviceId
      ) {
        return NextResponse.json(
          buildResponseFromNotebookCode(notebookCode, true)
        );
      }
      return NextResponse.json(
        errorBody('already_redeemed', 'Code already redeemed.'),
        { status: 409 }
      );
    }

    // status === AVAILABLE: do the redemption.
    await prisma.notebookCode.update({
      where: { id: notebookCode.id },
      data: {
        status: 'CLAIMED',
        claimedAt: new Date(),
        claimedDeviceId: deviceId ?? null,
        claimedIpAddress: ipAddress,
      },
    });

    return NextResponse.json(
      buildResponseFromNotebookCode(notebookCode, true)
    );
  }

  // ─── 2. LegacyTeamCode (admin-created, multi-redemption) ────────
  // Legacy codes don't have a one-shot rule server-side. The iOS
  // client enforces "one notebook per code" locally, but multiple
  // devices on the same code resolve fine here.
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
        errorBody('invalid', 'Code inactive.'),
        { status: 410 }
      );
    }
    if (legacy.expiresAt && legacy.expiresAt < new Date()) {
      return NextResponse.json(
        errorBody('invalid', 'Code expired.'),
        { status: 410 }
      );
    }
    return NextResponse.json(buildResponseFromLegacyCode(legacy));
  }

  // ─── 3. Not found ───────────────────────────────────────────────
  return NextResponse.json(
    errorBody('not_found', 'Invalid team code.'),
    { status: 404 }
  );
}

// ─── Response builders ──────────────────────────────────────────────
//
// Shape matches GET /api/team/[code] exactly so the iOS code paths
// can share a single decoder. The only addition is `redeemed: true`,
// a hint the client can use to differentiate "fresh activation" from
// "already-redeemed device echo".

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
