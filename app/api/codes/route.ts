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
 * List notebook codes for the caller's company.
 *
 * Wrapped in a try/catch so unexpected Prisma errors surface as JSON
 * instead of bare 500s — the codes table parses JSON on every page
 * load, and an HTML 500 would otherwise show as a generic
 * "Network error" in the UI.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse(Object.fromEntries(sp));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query params', details: parsed.error.flatten() },
        { status: 400 }
      );
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
          // Most recent successful email log for this code, used by
          // the table UI to badge codes as "Sent" (single-send) vs
          // "Sent in batch" (from a distribution batch). The relation
          // is `emailLogs` on NotebookCode (NotebookCode 1..N EmailLog).
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
  } catch (err) {
    // Surface the real error to the client so the table shows it
    // instead of a generic "Network error". Vercel logs the full
    // stack regardless.
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/codes] failed:', err);
    return NextResponse.json(
      { error: `Codes list failed: ${message}` },
      { status: 500 }
    );
  }
}
