import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/company/me — read & update the current user's company.
 *
 * Permissions:
 *   GET    — any authenticated user with a companyId
 *   PATCH  — OWNER / ADMIN of the company, or SUPERADMIN
 *
 * The UI for this lives at /settings/company.
 *
 * Notes on what we expose vs what we keep server-only:
 *   - Stripe customer id, internal flags etc. are NEVER returned.
 *   - logo URLs are public (R2 custom domain) so they're fine to
 *     return.
 *   - PATCH only allows the user-editable subset; tampering attempts
 *     for stripeCustomerId etc. fail Zod parse, not silently dropped.
 */
export async function GET() {
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 404 });
  }

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: {
      id: true,
      slug: true,
      name: true,
      legalName: true,
      vatNumber: true,
      taxCode: true,
      address: true,
      city: true,
      zipCode: true,
      country: true,
      sdiCode: true,
      pecEmail: true,
      logoSymbolUrl: true,
      logoExtendedUrl: true,
      primaryColor: true,
    },
  });
  if (!company) {
    return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  }
  return NextResponse.json({ company });
}

const patchSchema = z
  .object({
    // Core info
    name: z.string().trim().min(1).max(120).optional(),
    legalName: z.string().trim().max(200).nullable().optional(),
    // Tax / billing fields. Empty strings collapse to null so admins
    // can clear a value by submitting "". null → leave field unchanged.
    vatNumber: z.string().trim().max(40).nullable().optional(),
    taxCode: z.string().trim().max(40).nullable().optional(),
    address: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    zipCode: z.string().trim().max(20).nullable().optional(),
    country: z.string().trim().length(2).nullable().optional(),
    sdiCode: z.string().trim().max(10).nullable().optional(),
    pecEmail: z.string().trim().max(200).nullable().optional(),
    // Brand
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/i, 'Color must be a 6-digit hex like #1a1a1a.')
      .nullable()
      .optional(),
  })
  .strict();

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 404 });
  }
  const allowed =
    session.role === 'OWNER' ||
    session.role === 'ADMIN' ||
    session.role === 'SUPERADMIN';
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body.', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  // Convert empty strings to null so the form can clear fields. We
  // intentionally do this only AFTER Zod validation, so length and
  // format checks still apply to provided values.
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    data[k] = v === '' ? null : v;
  }

  const updated = await prisma.company.update({
    where: { id: session.companyId },
    data,
    select: {
      id: true,
      slug: true,
      name: true,
      legalName: true,
      vatNumber: true,
      taxCode: true,
      address: true,
      city: true,
      zipCode: true,
      country: true,
      sdiCode: true,
      pecEmail: true,
      logoSymbolUrl: true,
      logoExtendedUrl: true,
      primaryColor: true,
    },
  });

  return NextResponse.json({ company: updated });
}
