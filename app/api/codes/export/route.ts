import { NextRequest, NextResponse } from 'next/server';
import { CodeStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Export codes as CSV download.
 * Supports the same filters as /api/codes.
 * Returns text/csv with a downloadable filename.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get('status');
  const orderId = sp.get('orderId') ?? undefined;

  const status =
    statusParam && Object.values(CodeStatus).includes(statusParam as CodeStatus)
      ? (statusParam as CodeStatus)
      : undefined;

  const codes = await prisma.notebookCode.findMany({
    where: {
      companyId: session.companyId,
      ...(status ? { status } : {}),
      ...(orderId ? { orderId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      code: true,
      status: true,
      assignedToEmail: true,
      assignedToName: true,
      claimedAt: true,
      createdAt: true,
      orderId: true,
    },
  });

  // Build CSV — escape commas and quotes per RFC 4180
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = 'code,status,assigned_to_email,assigned_to_name,claimed_at,created_at,order_id\n';
  const rows = codes
    .map((c) =>
      [
        c.code,
        c.status,
        c.assignedToEmail,
        c.assignedToName,
        c.claimedAt,
        c.createdAt,
        c.orderId,
      ]
        .map(escape)
        .join(',')
    )
    .join('\n');

  const csv = header + rows + (rows.length > 0 ? '\n' : '');
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="perenne-codes-${date}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
