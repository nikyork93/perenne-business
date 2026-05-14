import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Super-admin orders listing. Returns ALL orders across companies for
 * the manual payment review queue. Filterable by status.
 */
export async function GET(req: NextRequest) {
  await requireRole('SUPERADMIN');

  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get('status') as OrderStatus | null;
  const validStatuses = new Set<OrderStatus>(Object.values(OrderStatus));

  const where = statusParam && validStatuses.has(statusParam) ? { status: statusParam } : {};

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { id: true, name: true, slug: true } },
      _count: { select: { notebookCodes: true } },
    },
    take: 500,
  });

  return NextResponse.json({
    ok: true,
    orders: orders.map((o) => ({
      id: o.id,
      companyId: o.company.id,
      companyName: o.company.name,
      companySlug: o.company.slug,
      packageType: o.packageType,
      quantity: o.quantity,
      totalPriceCents: o.totalPriceCents,
      currency: o.currency,
      status: o.status,
      paymentReference: o.paymentReference,
      customerNote: o.customerNote,
      invoiceNumber: o.invoiceNumber,
      invoiceIssuedAt: o.invoiceIssuedAt,
      approvedByEmail: o.approvedByEmail,
      approvedAt: o.approvedAt,
      paidAt: o.paidAt,
      codesCount: o._count.notebookCodes,
      createdAt: o.createdAt,
    })),
  });
}
