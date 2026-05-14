import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { getTier, formatEuros } from '@/lib/pricing';
import { getBankDetails } from '@/lib/bank';

export const runtime = 'nodejs';

interface Params { params: Promise<{ id: string }>; }

/**
 * Return the invoice for an order as printable HTML. The customer
 * opens this URL in a new tab, and uses Cmd+P → Save as PDF to get a
 * PDF locally. This sidesteps adding a PDF library to the bundle.
 *
 * Access: the order's company OWNER/ADMIN/VIEWER, or any SUPERADMIN.
 * Invoices are only available for PAID orders (status guard).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      company: true,
    },
  });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwn = order.companyId === session.companyId;
  const isAdmin = session.role === 'SUPERADMIN';
  if (!isOwn && !isAdmin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (order.status !== 'PAID' || !order.invoiceNumber) {
    return NextResponse.json(
      { error: 'Invoice not yet available — this order has not been marked PAID.' },
      { status: 400 }
    );
  }

  const tier = getTier(order.packageType);
  const bank = await getBankDetails();
  const issuedAt = order.invoiceIssuedAt ?? order.paidAt ?? order.createdAt;
  const issuedDate = new Date(issuedAt).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'long', day: '2-digit',
  });

  const c = order.company;
  const customerLines = [
    c.legalName || c.name,
    c.address,
    [c.zipCode, c.city].filter(Boolean).join(' '),
    c.country,
    c.vatNumber ? `VAT: ${c.vatNumber}` : null,
    c.taxCode ? `Tax code: ${c.taxCode}` : null,
  ].filter(Boolean).join('<br/>');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${order.invoiceNumber}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #111;
    background: #fff;
    margin: 0;
    padding: 48px 56px;
    font-size: 13px;
    line-height: 1.55;
  }
  .invoice {
    max-width: 760px;
    margin: 0 auto;
  }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 40px; margin-bottom: 40px; }
  .brand { font-family: 'Georgia', serif; font-style: italic; font-size: 28px; letter-spacing: -0.02em; }
  .brand-sub { font-size: 10px; text-transform: uppercase; letter-spacing: 0.22em; color: #666; margin-top: 4px; }
  .doc-meta { text-align: right; }
  .doc-meta h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
  .doc-meta .num { font-family: 'SF Mono', Menlo, monospace; font-size: 12px; color: #444; }
  .doc-meta .date { font-size: 11px; color: #666; margin-top: 4px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 32px; }
  .party h3 { margin: 0 0 8px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.18em; color: #888; font-weight: 600; }
  .party p { margin: 0; font-size: 12px; color: #222; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { padding: 12px 8px; text-align: left; border-bottom: 1px solid #eee; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: #666; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { display: flex; justify-content: flex-end; }
  .totals table { width: 320px; }
  .totals .grand th, .totals .grand td { border-top: 2px solid #111; border-bottom: none; font-size: 15px; font-weight: 700; padding-top: 14px; }
  footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid #eee; font-size: 10px; color: #777; line-height: 1.7; }
  .stamp { display: inline-block; margin-top: 8px; padding: 4px 10px; border: 1px solid #2e7d32; color: #2e7d32; font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em; border-radius: 4px; font-weight: 600; }
  @media print {
    body { padding: 0; }
    .invoice { max-width: none; }
  }
</style>
</head>
<body>
<div class="invoice">
  <header>
    <div>
      <div class="brand">Perenne</div>
      <div class="brand-sub">Business · Invoice</div>
    </div>
    <div class="doc-meta">
      <h1>INVOICE</h1>
      <div class="num">${order.invoiceNumber}</div>
      <div class="date">Issued ${issuedDate}</div>
      <div class="stamp">PAID</div>
    </div>
  </header>

  <section class="parties">
    <div class="party">
      <h3>From</h3>
      <p>
        ${bank.beneficiary}<br/>
        ${bank.beneficiaryAddress}<br/>
        VAT: ${bank.beneficiaryVat}
      </p>
    </div>
    <div class="party">
      <h3>Bill to</h3>
      <p>${customerLines}</p>
    </div>
  </section>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit price</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          ${tier?.name ?? order.packageType} pack
          <div style="font-size: 11px; color: #777; margin-top: 2px;">Branded notebook codes — lifetime activation</div>
        </td>
        <td class="num">${order.quantity}</td>
        <td class="num">${formatEuros(order.unitPriceCents)}</td>
        <td class="num">${formatEuros(order.unitPriceCents * order.quantity)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <th>Subtotal</th>
        <td class="num">${formatEuros(order.totalPriceCents - order.taxCents)}</td>
      </tr>
      ${order.taxCents > 0 ? `<tr><th>VAT</th><td class="num">${formatEuros(order.taxCents)}</td></tr>` : ''}
      <tr class="grand">
        <th>Total ${order.currency}</th>
        <td class="num">${formatEuros(order.totalPriceCents)}</td>
      </tr>
    </table>
  </div>

  <footer>
    <strong>Payment reference:</strong> ${order.paymentReference ?? '—'}<br/>
    <strong>Order ID:</strong> ${order.id}<br/>
    <br/>
    Issued by ${bank.beneficiary} · ${bank.beneficiaryVat}<br/>
    For questions about this invoice, reply to business@perenne.app
  </footer>
</div>
<script>
  // Open the print dialog automatically when the URL has ?print=1
  if (window.location.search.includes('print=1')) {
    setTimeout(() => window.print(), 300);
  }
</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
