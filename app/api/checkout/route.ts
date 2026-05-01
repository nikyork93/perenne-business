import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PackageType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { getStripe } from '@/lib/stripe';
import { getTier } from '@/lib/pricing';
import { buildDesignSnapshot, getOrCreateDefaultDesign } from '@/lib/design';

export const runtime = 'nodejs';

/**
 * POST /api/checkout
 *
 * Body: { packageType: PackageType, designId?: string }
 *
 * Behaviour change in Session 1:
 * - Now accepts an optional designId so the buyer can pick which design
 *   the codes will use. If omitted, the company's default design is used.
 * - At PENDING order creation, the chosen Design is COPIED into
 *   order.designSnapshotJson — a frozen JSON that iOS (post-Session-3)
 *   reads at code redemption. Subsequent edits to the source Design
 *   never affect this order. Snapshot is taken at PENDING (not at
 *   webhook PAID) so the user gets exactly the design they saw at
 *   checkout, even if it's edited between checkout and payment
 *   confirmation.
 */
const bodySchema = z.object({
  packageType: z.nativeEnum(PackageType),
  designId: z.string().cuid().optional(),
});

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

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
    }
    parsedBody = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tier = getTier(parsedBody.packageType);
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

  // ── Resolve the Design to snapshot ──────────────────────────────
  const design = parsedBody.designId
    ? await prisma.design.findFirst({
        where: {
          id: parsedBody.designId,
          companyId: session.companyId,
          isArchived: false,
        },
      })
    : await getOrCreateDefaultDesign(session.companyId);

  if (!design) {
    return NextResponse.json(
      {
        error: parsedBody.designId
          ? 'Design not found or archived.'
          : 'No default design configured. Configure your cover first.',
      },
      { status: 400 }
    );
  }

  const snapshot = buildDesignSnapshot(design);

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

  // Create a PENDING order with the design SNAPSHOT frozen-in.
  const order = await prisma.order.create({
    data: {
      companyId: company.id,
      packageType: parsedBody.packageType,
      quantity: tier.quantity,
      unitPriceCents: tier.pricePerCodeCents,
      totalPriceCents: tier.priceCents,
      currency: 'EUR',
      status: 'PENDING',
      designId: design.id,
      designSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

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
            description: `${tier.quantity} branded notebook codes — ${design.name}`,
          },
        },
        quantity: 1,
      },
    ],
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `${tier.name} pack — ${tier.quantity} notebook codes (${design.name})`,
        metadata: {
          orderId: order.id,
          companyId: company.id,
          designId: design.id,
        },
      },
    },
    metadata: {
      orderId: order.id,
      companyId: company.id,
      packageType: parsedBody.packageType,
      quantity: String(tier.quantity),
      designId: design.id,
    },
    payment_intent_data: {
      metadata: {
        orderId: order.id,
        companyId: company.id,
      },
    },
    success_url: `${env.NEXT_PUBLIC_APP_URL}/store/success?order_id=${order.id}`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/store?cancelled=1`,
  });

  return NextResponse.json({
    ok: true,
    url: checkoutSession.url,
    orderId: order.id,
    designId: design.id,
    designName: design.name,
  });
}
