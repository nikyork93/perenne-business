import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      packageType: true,
      quantity: true,
      totalPriceCents: true,
      taxCents: true,
      currency: true,
      status: true,
      paidAt: true,
      refundedAt: true,
      stripeInvoiceUrl: true,
      createdAt: true,
      _count: { select: { notebookCodes: true } },
    },
  });

  return NextResponse.json({ ok: true, orders });
}
