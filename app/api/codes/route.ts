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

  const [total, codes] = await Promise.all([
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
        distributionId: true,
        // Most recent successful email log for this code, used by the
        // table UI to badge codes as "SENT" (single-send) or
        // "SENT IN BATCH" (from a distribution batch).
        emailLogs: {
          where: { status: 'SENT' },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: {
            id: true,
            batchId: true,
            recipientEmail: true,
            sentAt: true,
          },
        },
      },
    }),
  ]);

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
