import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export const runtime = 'nodejs';

interface Params { params: Promise<{ id: string }>; }

const bodySchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});

/**
 * Cancel a pending order. Super-admin only. Used when the wire never
 * arrives, or the customer asked to reverse the request. PAID orders
 * cannot be cancelled here — use refund flow once we add it.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireRole('SUPERADMIN');
  const { id } = await params;

  let reason = '';
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (parsed.success) reason = parsed.data.reason ?? '';
  } catch {
    // empty body is fine
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.status === 'PAID' || order.status === 'REFUNDED') {
    return NextResponse.json(
      { error: `Order is ${order.status} and cannot be cancelled here.` },
      { status: 400 }
    );
  }
  if (order.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Order is already cancelled.' }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    });
    await tx.auditLog.create({
      data: {
        companyId: order.companyId,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'admin.order.cancelled',
        targetType: 'Order',
        targetId: order.id,
        metadata: { reason: reason || undefined },
      },
    });
    return o;
  });

  return NextResponse.json({ ok: true, order: { id: updated.id, status: updated.status } });
}
