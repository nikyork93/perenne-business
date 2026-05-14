import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

interface Params { params: Promise<{ id: string }>; }

/**
 * Customer-side action: tell us they've sent the bank wire.
 * Moves order from PENDING → AWAITING_PAYMENT.
 *
 * This is informational only — codes are NOT released here. The
 * super-admin still has to manually confirm that the wire actually
 * arrived, via POST /api/admin/orders/[id]/approve.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || order.companyId !== session.companyId) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Order is ${order.status}, cannot mark as awaiting payment.` },
      { status: 400 }
    );
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: 'AWAITING_PAYMENT' },
  });

  await prisma.auditLog.create({
    data: {
      companyId: order.companyId,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'order.awaiting_payment',
      targetType: 'Order',
      targetId: order.id,
      metadata: {},
    },
  });

  return NextResponse.json({ ok: true, order: { id: updated.id, status: updated.status } });
}
