import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Badge, Stat, Whisper, Button } from '@/components/ui';
import { getTier, formatEuros } from '@/lib/pricing';
import type { OrderStatus } from '@prisma/client';

const STATUS_TONE: Record<OrderStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  REFUNDED: 'neutral',
};

export const metadata = {
  title: 'Billing',
};

export default async function BillingPage() {
  const session = await requireSession();
  if (!session.companyId) {
    redirect('/onboarding');
  }

  const companyId = session.companyId;

  const [company, orders] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.order.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { notebookCodes: true } } },
    }),
  ]);

  const totalSpentCents = orders
    .filter((o) => o.status === 'PAID')
    .reduce((sum, o) => sum + o.totalPriceCents, 0);

  const totalCodesPurchased = orders
    .filter((o) => o.status === 'PAID')
    .reduce((sum, o) => sum + o.quantity, 0);

  const paidCount = orders.filter((o) => o.status === 'PAID').length;

  return (
    <Shell
      companyName={company?.name}
      companyLogoUrl={company?.logoSymbolUrl}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Billing"
        title="Orders & invoices"
        description="Your order history, invoices, and total spend."
        actions={
          <Link href="/store">
            <Button variant="primary">+ New order</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <Stat label="Total spent" value={formatEuros(totalSpentCents)} hint={`${paidCount} paid orders`} />
        <Stat label="Codes purchased" value={totalCodesPurchased} hint="lifetime total" />
        <Stat label="Orders" value={orders.length} hint="all statuses" />
      </div>

      <GlassPanel padding="none" className="overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-10">
            <Whisper>
              No orders yet. Head to the{' '}
              <Link href="/store" className="underline hover:text-ink">Store</Link>
              {' '}to purchase your first notebook pack.
            </Whisper>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">Date</th>
                  <th className="text-left label px-4 py-3">Package</th>
                  <th className="text-left label px-4 py-3">Codes</th>
                  <th className="text-left label px-4 py-3">Amount</th>
                  <th className="text-left label px-4 py-3">Status</th>
                  <th className="text-left label px-4 py-3">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const tier = getTier(o.packageType);
                  return (
                    <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-dim">
                        {new Date(o.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-display italic">{tier?.name ?? o.packageType}</div>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {o._count.notebookCodes}
                        <span className="text-ink-faint"> / {o.quantity}</span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {formatEuros(o.totalPriceCents)}
                        {o.taxCents > 0 && (
                          <span className="text-[10px] text-ink-faint block">
                            incl. {formatEuros(o.taxCents)} VAT
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[o.status]}>{o.status.toLowerCase()}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {o.stripeInvoiceUrl ? (
                          <a href={o.stripeInvoiceUrl} target="_blank" rel="noopener" className="text-accent hover:underline text-[11px]">
                            View ↗
                          </a>
                        ) : (
                          <span className="text-ink-faint text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </Shell>
  );
}
