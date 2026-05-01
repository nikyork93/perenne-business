/**
 * /api/admin/legacy-codes
 *
 * GET  → list all (search, paginate)
 * POST → create new manual code
 *
 * SUPERADMIN only — these are cross-company codes (partners, demos,
 * trade shows). Regular OWNERs use /store + /designs to issue codes
 * tied to Stripe purchases.
 *
 * Replaces the old Cloudflare Worker /admin panel that wrote to KV.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

// ── GET ─────────────────────────────────────────────────────────────
const querySchema = z.object({
  search: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false', 'all']).optional().default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(sp));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query.' }, { status: 400 });
  }
  const { search, active, page, pageSize } = parsed.data;

  const where: Prisma.LegacyTeamCodeWhereInput = {
    ...(search
      ? {
          OR: [
            { code: { contains: search.toUpperCase() } },
            { label: { contains: search, mode: 'insensitive' } },
            { manualCompanyName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(active === 'true' ? { isActive: true } : {}),
    ...(active === 'false' ? { isActive: false } : {}),
  };

  const [total, codes] = await Promise.all([
    prisma.legacyTeamCode.count({ where }),
    prisma.legacyTeamCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        company: { select: { id: true, name: true, slug: true } },
        design:  { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    codes,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

// ── POST ────────────────────────────────────────────────────────────
const createBodySchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9-]+$/i, 'Code must be alphanumeric (and dashes).'),
  label: z.string().trim().max(120).optional().nullable(),
  companyId: z.string().cuid().optional().nullable(),
  designId: z.string().cuid().optional().nullable(),
  manualCompanyName: z.string().trim().max(120).optional().nullable(),
  manualLogoUrl: z.string().url().optional().nullable(),
  manualLogoExtUrl: z.string().url().optional().nullable(),
  manualLogoWhiteUrl: z.string().url().optional().nullable(),
  manualPrimaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .nullable(),
  manualQuote: z.string().trim().max(500).optional().nullable(),
  seats: z.number().int().min(1).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  let body: z.infer<typeof createBodySchema>;
  try {
    body = createBodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
            : 'Invalid JSON.',
      },
      { status: 400 }
    );
  }

  const code = body.code.trim().toUpperCase();

  // Uniqueness check across BOTH tables — a manual code can't collide
  // with a Stripe-issued NotebookCode (would break /api/team lookup).
  const collision = await prisma.notebookCode.findUnique({ where: { code } });
  if (collision) {
    return NextResponse.json(
      { error: 'Code collides with a Stripe-issued notebook code.' },
      { status: 409 }
    );
  }
  const dupLegacy = await prisma.legacyTeamCode.findUnique({ where: { code } });
  if (dupLegacy) {
    return NextResponse.json(
      { error: 'Code already exists (legacy).' },
      { status: 409 }
    );
  }

  const created = await prisma.legacyTeamCode.create({
    data: {
      code,
      label: body.label ?? null,
      companyId: body.companyId ?? null,
      designId: body.designId ?? null,
      manualCompanyName: body.manualCompanyName ?? null,
      manualLogoUrl: body.manualLogoUrl ?? null,
      manualLogoExtUrl: body.manualLogoExtUrl ?? null,
      manualLogoWhiteUrl: body.manualLogoWhiteUrl ?? null,
      manualPrimaryColor: body.manualPrimaryColor ?? null,
      manualQuote: body.manualQuote ?? null,
      seats: body.seats ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      isActive: body.isActive,
      createdByEmail: session.email,
    },
  });

  await prisma.auditLog.create({
    data: {
      companyId: body.companyId ?? null,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'legacy_code.created',
      targetType: 'LegacyTeamCode',
      targetId: created.id,
      metadata: { code, label: body.label } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ code: created }, { status: 201 });
}
