import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PackageType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { getTier } from '@/lib/pricing';
import { paymentReferenceFor, getBankDetails } from '@/lib/bank';

export const runtime = 'nodejs';

const bodySchema = z.object({
  packageType: z.nativeEnum(PackageType),
  customerNote: z.string().trim().max(1000).optional().or(z.literal('')),
});

/**
 * Create a manual order. Used while Stripe is offline / not connected.
 *
 * Flow:
 *   1) Customer submits → we create Order(PENDING) with a generated
 *      paymentReference, return BANK_DETAILS so the popup shows the
 *      wire coordinates.
 *   2) Customer clicks "I'll send the wire" in the popup → PATCH to
 *      this same order endpoint moves it to AWAITING_PAYMENT.
 *   3) Super-admin sees the order in /admin/orders, confirms payment
 *      → status goes to PAID and N codes are issued in a transaction.
 *
 * No external payment provider is contacted. Stripe-specific fields
 * on Order remain null. invoiceNumber is assigned only at PAID time.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'OWNER' && session.role !== 'SUPERADMIN') {
    return NextResponse.json(
      { error: 'Only the company OWNER can purchase packs.' },
      { status: 403 }
    );
  }

  let payload: z.infer<typeof bodySchema>;
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
    }
    payload = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tier = getTier(payload.packageType);
  if (!tier) {
    return NextResponse.json({ error: 'Unknown package' }, { status: 400 });
  }
  if (tier.contactSales) {
    return NextResponse.json(
      { error: 'This tier requires custom pricing. Contact sales.' },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
  });
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Create the order first so we can derive its ref from its real id.
  const order = await prisma.order.create({
    data: {
      companyId: company.id,
      packageType: payload.packageType,
      quantity: tier.quantity,
      unitPriceCents: tier.pricePerCodeCents,
      totalPriceCents: tier.priceCents,
      taxCents: 0,
      currency: 'EUR',
      status: 'PENDING',
      customerNote: payload.customerNote || null,
    },
  });

  const paymentReference = paymentReferenceFor(order.id);

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { paymentReference },
  });

  await prisma.auditLog.create({
    data: {
      companyId: company.id,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'order.created',
      targetType: 'Order',
      targetId: updated.id,
      metadata: {
        package: tier.id,
        quantity: tier.quantity,
        totalCents: tier.priceCents,
        paymentReference,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    order: {
      id: updated.id,
      packageType: updated.packageType,
      quantity: updated.quantity,
      totalPriceCents: updated.totalPriceCents,
      paymentReference,
      status: updated.status,
    },
    bank: await getBankDetails(),
  });
}
