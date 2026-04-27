import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PackageType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { getStripe } from '@/lib/stripe';
import { getTier } from '@/lib/pricing';

export const runtime = 'nodejs';

const bodySchema = z.object({
  packageType: z.nativeEnum(PackageType),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Only OWNER or SUPERADMIN can purchase
  if (session.role !== 'OWNER' && session.role !== 'SUPERADMIN') {
    return NextResponse.json(
      { error: 'Only the company OWNER can purchase packs.' },
      { status: 403 }
    );
  }

  let packageType: PackageType;
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid package type' }, { status: 400 });
    }
    packageType = parsed.data.packageType;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tier = getTier(packageType);
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

  const stripe = getStripe();

  // Ensure Stripe Customer exists for this company
  let stripeCustomerId = company.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: session.email,
      name: company.legalName || company.name,
      metadata: {
        companyId: company.id,
        slug: company.slug,
      },
      address: company.address
        ? {
            line1: company.address,
            city: company.city ?? undefined,
            postal_code: company.zipCode ?? undefined,
            country: company.country ?? undefined,
          }
        : undefined,
    });
    stripeCustomerId = customer.id;
    await prisma.company.update({
      where: { id: company.id },
      data: { stripeCustomerId },
    });
  }

  // Create a PENDING order — webhook will mark PAID + generate codes
  const order = await prisma.order.create({
    data: {
      companyId: company.id,
      packageType,
      quantity: tier.quantity,
      unitPriceCents: tier.pricePerCodeCents,
      totalPriceCents: tier.priceCents,
      currency: 'EUR',
      status: 'PENDING',
    },
  });

  // Create Stripe Checkout Session
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: tier.priceCents,
          product_data: {
            name: `Perenne Business — ${tier.name} pack`,
            description: `${tier.quantity} branded notebook codes`,
          },
        },
        quantity: 1,
      },
    ],
    // Enable automatic tax (requires Stripe Tax configured in dashboard)
    automatic_tax: { enabled: true },
    // Collect fiscal info if missing
    tax_id_collection: { enabled: true },
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `${tier.name} pack — ${tier.quantity} notebook codes`,
        metadata: {
          orderId: order.id,
          companyId: company.id,
        },
      },
    },
    metadata: {
      orderId: order.id,
      companyId: company.id,
      packageType,
      quantity: String(tier.quantity),
    },
    // Pass orderId in PaymentIntent metadata too, so we can link back from
    // payment_intent.payment_failed webhook (Stripe doesn't include session metadata there)
    payment_intent_data: {
      metadata: {
        orderId: order.id,
        companyId: company.id,
      },
    },
    success_url: `${env.NEXT_PUBLIC_APP_URL}/store/success?order_id=${order.id}`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/store?cancelled=1`,
    // Limit to Perenne's primary markets for fraud protection
    // Omit for worldwide
    // allowed_countries: ['IT', 'CH', 'DE', 'FR', 'ES', 'AT', 'BE', 'NL', 'PT', 'IE', 'SE', 'DK', 'FI', 'GB', 'US'],
  });

  // NOTE: checkoutSession.payment_intent is null at creation time — it's populated
  // only after the user completes checkout. The `checkout.session.completed` webhook
  // sets order.stripePaymentIntentId from the final session.payment_intent value.

  return NextResponse.json({
    ok: true,
    url: checkoutSession.url,
    orderId: order.id,
  });
}
