import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { generateNotebookCode } from '@/lib/crypto';
import { invoiceNumberFromCount } from '@/lib/bank';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface Params { params: Promise<{ id: string }>; }

/**
 * Mark a manual order as PAID. Super-admin only.
 *
 * Side effects (all in a single transaction):
 *   1) order.status → PAID, paidAt set, approvedBy* fields set
 *   2) Sequential invoiceNumber assigned (INV-YYYY-NNNN)
 *   3) N notebook codes generated and linked to this order
 *   4) Audit log entry: admin.order.approved
 *   5) Customer email sent (best-effort, outside the transaction)
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await requireRole('SUPERADMIN');
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      _count: { select: { notebookCodes: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.status === 'PAID') {
    return NextResponse.json(
      { error: 'Order is already PAID' },
      { status: 400 }
    );
  }
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    return NextResponse.json(
      { error: `Order is ${order.status} and cannot be approved.` },
      { status: 400 }
    );
  }

  const codes: string[] = [];
  for (let i = 0; i < order.quantity; i++) {
    codes.push(generateNotebookCode());
  }

  // Resolve the next invoice number inside the transaction. Counting
  // by issued invoices this year keeps the sequence dense.
  const year = new Date().getFullYear();

  const updated = await prisma.$transaction(async (tx) => {
    const paidThisYearBefore = await tx.order.count({
      where: {
        status: 'PAID',
        invoiceIssuedAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt:  new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
    const invoiceNumber = invoiceNumberFromCount(year, paidThisYearBefore);

    const o = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        invoiceNumber,
        invoiceIssuedAt: new Date(),
        approvedByEmail: session.email,
        approvedAt: new Date(),
      },
    });

    // Bulk-insert codes
    await tx.notebookCode.createMany({
      data: codes.map((code) => ({
        code,
        companyId: order.companyId,
        orderId: order.id,
        status: 'AVAILABLE',
      })),
      skipDuplicates: true,
    });

    await tx.auditLog.create({
      data: {
        companyId: order.companyId,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'admin.order.approved',
        targetType: 'Order',
        targetId: order.id,
        metadata: {
          codesGenerated: order.quantity,
          totalCents: order.totalPriceCents,
          invoiceNumber,
        },
      },
    });

    return o;
  });

  // Best-effort notification to OWNERs of this company. Failure here
  // doesn't roll back the order — the work is already done in DB.
  try {
    const owners = await prisma.user.findMany({
      where: { companyId: order.companyId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { email: true, name: true },
    });
    for (const u of owners) {
      await sendEmail({
        to: u.email,
        subject: `Payment received — your ${order.quantity} codes are ready`,
        text:
`Hi${u.name ? ` ${u.name}` : ''},

We've received your payment for order ${updated.invoiceNumber}.

${order.quantity} notebook codes are now available in your Perenne Business workspace, ready to distribute to your team.

Open Perenne Business → Codes:
https://business.perenne.app/codes

Invoice ${updated.invoiceNumber} is available in the Billing section.

— Perenne`,
        html:
`<p>Hi${u.name ? ` ${u.name}` : ''},</p>
<p>We've received your payment for order <strong>${updated.invoiceNumber}</strong>.</p>
<p><strong>${order.quantity} notebook codes</strong> are now available in your Perenne Business workspace, ready to distribute to your team.</p>
<p><a href="https://business.perenne.app/codes">Open Perenne Business → Codes</a></p>
<p>Invoice <strong>${updated.invoiceNumber}</strong> is available in the Billing section.</p>
<p>— Perenne</p>`,
      });
    }
  } catch {
    // ignore — DB is the source of truth
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: updated.id,
      status: updated.status,
      invoiceNumber: updated.invoiceNumber,
      paidAt: updated.paidAt,
    },
    codesGenerated: order.quantity,
  });
}
