import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { getStripe } from '@/lib/stripe';
import { generateNotebookCode } from '@/lib/crypto';

export const runtime = 'nodejs';

/**
 * Stripe webhook endpoint.
 *
 * IMPORTANT: This route is excluded from CSRF / middleware session checks.
 * Signature verification is the auth mechanism here.
 *
 * Events handled:
 * - checkout.session.completed → order PAID + generate codes
 * - payment_intent.payment_failed → order FAILED
 * - charge.refunded → order REFUNDED
 */
export async function POST(req: NextRequest) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const stripe = getStripe();
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Raw body needed for signature verification
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid signature';
    console.error('Webhook signature verification failed:', msg);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event.data.object);
        break;
      }
      case 'payment_intent.payment_failed': {
        await handlePaymentFailed(event.data.object);
        break;
      }
      case 'charge.refunded': {
        await handleRefunded(event.data.object);
        break;
      }
      default:
        // Acknowledge other events but don't process
        console.log(`Unhandled Stripe event: ${event.type}`);
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error(`Error processing ${event.type}:`, e);
    // Return 500 so Stripe retries
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }
}

// ─── Handlers ────────────────────────────────────────────────

async function handleCheckoutCompleted(sessionObj: Stripe.Checkout.Session) {
  const orderId = sessionObj.metadata?.orderId;
  const companyId = sessionObj.metadata?.companyId;
  if (!orderId || !companyId) {
    console.error('Checkout session missing metadata', sessionObj.id);
    return;
  }

  // Idempotency: if order already PAID, skip
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) {
    console.error(`Order ${orderId} not found`);
    return;
  }
  if (existing.status === 'PAID') {
    console.log(`Order ${orderId} already PAID — skipping duplicate webhook`);
    return;
  }

  // Extract invoice info if present
  let stripeInvoiceId: string | null = null;
  let stripeInvoiceUrl: string | null = null;
  if (sessionObj.invoice) {
    const invoiceId = typeof sessionObj.invoice === 'string'
      ? sessionObj.invoice
      : sessionObj.invoice.id;
    stripeInvoiceId = invoiceId ?? null;
    if (invoiceId) {
      const stripe = getStripe();
      const inv = await stripe.invoices.retrieve(invoiceId);
      stripeInvoiceUrl = inv.hosted_invoice_url ?? null;
    }
  }

  // Tax (total_details.amount_tax is in cents)
  const taxCents = sessionObj.total_details?.amount_tax ?? 0;

  // Generate N unique codes in one transaction
  const quantity = existing.quantity;
  const codes: string[] = [];
  for (let i = 0; i < quantity; i++) {
    codes.push(generateNotebookCode());
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        taxCents,
        stripePaymentIntentId:
          typeof sessionObj.payment_intent === 'string'
            ? sessionObj.payment_intent
            : sessionObj.payment_intent?.id ?? null,
        stripeInvoiceId,
        stripeInvoiceUrl,
      },
    });

    // Bulk-insert notebook codes
    await tx.notebookCode.createMany({
      data: codes.map((code) => ({
        code,
        companyId,
        orderId,
        status: 'AVAILABLE',
      })),
      skipDuplicates: true, // in the extremely unlikely event of a collision
    });

    await tx.auditLog.create({
      data: {
        companyId,
        actorEmail: 'stripe-webhook@system',
        actorRole: 'SUPERADMIN',
        action: 'order.paid',
        targetType: 'Order',
        targetId: orderId,
        metadata: {
          codesGenerated: quantity,
          totalCents: existing.totalPriceCents,
          taxCents,
        },
      },
    });
  });

  // No more KV sync — the Cloudflare Worker has been dismissed.
  // Codes live in Postgres only; the public /api/team/[code]
  // endpoint reads them directly with edge cache. The middleware
  // makes api.perenne.app/team/* resolve to /api/team/* so the iOS
  // app sees zero change.

  console.log(`✓ Order ${orderId} PAID — generated ${quantity} codes`);
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  // Look up by orderId in PaymentIntent metadata.
  //
  // Why not by stripePaymentIntentId?
  // The order's stripePaymentIntentId is set only on checkout.session.completed.
  // If payment fails BEFORE the session completes (most common case), that
  // field is still null. The checkout route passes orderId via
  // payment_intent_data.metadata, which survives to the PaymentIntent here.
  const orderId = pi.metadata?.orderId;
  if (!orderId) {
    console.warn('payment_intent.payment_failed: no orderId in metadata', pi.id);
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    console.warn(`payment_intent.payment_failed: order ${orderId} not found`);
    return;
  }

  // Idempotency: skip if already finalized
  if (order.status === 'PAID' || order.status === 'REFUNDED') {
    console.log(`Order ${orderId} already ${order.status}, ignoring payment_failed`);
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'FAILED',
      stripePaymentIntentId: pi.id,  // record for forensics
    },
  });
  console.log(`✕ Order ${order.id} FAILED`);
}

async function handleRefunded(charge: Stripe.Charge) {
  const piId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!piId) return;

  const order = await prisma.order.findFirst({
    where: { stripePaymentIntentId: piId },
  });
  if (!order) return;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });
    // Revoke all AVAILABLE codes from this order
    await tx.notebookCode.updateMany({
      where: { orderId: order.id, status: 'AVAILABLE' },
      data: { status: 'REVOKED' },
    });
    await tx.auditLog.create({
      data: {
        companyId: order.companyId,
        actorEmail: 'stripe-webhook@system',
        actorRole: 'SUPERADMIN',
        action: 'order.refunded',
        targetType: 'Order',
        targetId: order.id,
      },
    });
  });
  console.log(`↩ Order ${order.id} REFUNDED`);
}
