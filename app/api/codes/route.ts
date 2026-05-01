import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CodeStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

const querySchema = z.object({
  status: z.nativeEnum(CodeStatus).optional(),
  orderId: z.string().cuid().optional(),
  search: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * GET /api/codes
 *
 * Lists notebook codes for the current company. Now also includes
 * the design name + designId of the parent order so the UI can show
 * which design each code is locked to (e.g. "Christmas 2026").
 *
 * Falls back gracefully for codes that pre-date the design migration:
 * if order.designId is null, designName is returned as null and the
 * UI shows a dash.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(sp));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
  }
  const { status, orderId, search, page, pageSize } = parsed.data;

  const where = {
    companyId: session.companyId,
    ...(status ? { status } : {}),
    ...(orderId ? { orderId } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search.toUpperCase() } },
            { assignedToEmail: { contains: search.toLowerCase() } },
            { assignedToName: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.notebookCode.count({ where }),
    prisma.notebookCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code: true,
        status: true,
        assignedToEmail: true,
        assignedToName: true,
        claimedAt: true,
        claimedDeviceId: true,
        createdAt: true,
        orderId: true,
        // Pull the design name through the order relation. We use a
        // shallow include so we don't ship the snapshot blob over
        // the wire — the iOS app reads that, not the dashboard.
        order: {
          select: {
            designId: true,
            design: { select: { name: true, isArchived: true } },
          },
        },
      },
    }),
  ]);

  // Flatten order.design.* into top-level designName / designId on the
  // code row so the client doesn't need nested types.
  const codes = rows.map((r) => ({
    id: r.id,
    code: r.code,
    status: r.status,
    assignedToEmail: r.assignedToEmail,
    assignedToName: r.assignedToName,
    claimedAt: r.claimedAt,
    claimedDeviceId: r.claimedDeviceId,
    createdAt: r.createdAt,
    orderId: r.orderId,
    designId: r.order?.designId ?? null,
    designName: r.order?.design?.name ?? null,
    designArchived: r.order?.design?.isArchived ?? false,
  }));

  return NextResponse.json({
    ok: true,
    codes,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
