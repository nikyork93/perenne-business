import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CodeStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

const querySchema = z.object({
  status: z.nativeEnum(CodeStatus).optional(),
  orderId: z.string().cuid().optional(),
  batchLabel: z.string().trim().max(120).optional(),
  search: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * GET /api/codes
 *
 * Lists notebook codes for the current company. Includes the design
 * name (from NotebookCode.design directly OR fallback through Order
 * for older Stripe codes that pre-date the direct-link migration).
 *
 * Filters: status, orderId, batchLabel, search (matches code/email/name).
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
  const { status, orderId, batchLabel, search, page, pageSize } = parsed.data;

  const where = {
    companyId: session.companyId,
    ...(status ? { status } : {}),
    ...(orderId ? { orderId } : {}),
    ...(batchLabel ? { batchLabel } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search.toUpperCase() } },
            { assignedToEmail: { contains: search.toLowerCase() } },
            { assignedToName: { contains: search } },
            { batchLabel: { contains: search } },
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
        assignedAt: true,
        claimedAt: true,
        claimedDeviceId: true,
        createdAt: true,
        orderId: true,
        batchLabel: true,
        notes: true,
        designId: true,
        design: { select: { name: true, isArchived: true } },
        order: {
          select: {
            designId: true,
            design: { select: { name: true, isArchived: true } },
          },
        },
      },
    }),
  ]);

  // Resolve design info: prefer direct designId, fallback to order.design
  const codes = rows.map((r) => {
    const directDesign = r.design;
    const orderDesign = r.order?.design ?? null;
    const dName = directDesign?.name ?? orderDesign?.name ?? null;
    const dArchived = directDesign?.isArchived ?? orderDesign?.isArchived ?? false;
    const dId = r.designId ?? r.order?.designId ?? null;
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      assignedToEmail: r.assignedToEmail,
      assignedToName: r.assignedToName,
      assignedAt: r.assignedAt?.toISOString() ?? null,
      claimedAt: r.claimedAt?.toISOString() ?? null,
      claimedDeviceId: r.claimedDeviceId,
      createdAt: r.createdAt.toISOString(),
      orderId: r.orderId,
      batchLabel: r.batchLabel,
      notes: r.notes,
      designId: dId,
      designName: dName,
      designArchived: dArchived,
    };
  });

  return NextResponse.json({
    codes,
    pagination: {
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      pageSize,
      page,
    },
  });
}
