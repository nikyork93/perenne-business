import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Stat } from '@/components/ui';
import { formatEuros, getTier } from '@/lib/pricing';

export default async function AdminRevenuePage() {
  const session = await requireRole('SUPERADMIN');

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [allPaid, paid30d, paid90d, paidByTier] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'PAID' },
      select: { totalPriceCents: true, taxCents: true, quantity: true, paidAt: true, packageType: true, companyId: true },
      orderBy: { paidAt: 'desc' },
    }),
    prisma.order.aggregate({
      where: { status: 'PAID', paidAt: { gte: thirtyDaysAgo } },
      _sum: { totalPriceCents: true, quantity: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { status: 'PAID', paidAt: { gte: ninetyDaysAgo } },
      _sum: { totalPriceCents: true },
      _count: true,
    }),
    prisma.order.groupBy({
      by: ['packageType'],
      where: { status: 'PAID' },
      _sum: { totalPriceCents: true, quantity: true },
      _count: true,
    }),
  ]);

  const lifetimeRevenue = allPaid.reduce((s, o) => s + o.totalPriceCents, 0);
  const lifetimeCodes = allPaid.reduce((s, o) => s + o.quantity, 0);
  const lifetimeOrders = allPaid.length;
  const uniqueCompanies = new Set(allPaid.map((o) => o.companyId)).size;
  const avgOrderValue = lifetimeOrders > 0 ? lifetimeRevenue / lifetimeOrders : 0;

  return (
    <Shell userEmail={session.email} isSuperAdmin={true}>
      <PageHeader
        eyebrow="Superadmin · Revenue"
        title="Revenue overview"
        description="Lifetime and recent performance across all Perenne Business customers."
      />

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <Stat label="Lifetime revenue" value={formatEuros(lifetimeRevenue) as any} hint={`${lifetimeOrders} orders`} />
        <Stat label="Last 30 days" value={formatEuros(paid30d._sum.totalPriceCents ?? 0) as any} hint={`${paid30d._count} orders`} />
        <Stat label="Last 90 days" value={formatEuros(paid90d._sum.totalPriceCents ?? 0) as any} hint={`${paid90d._count} orders`} />
        <Stat label="Paying companies" value={uniqueCompanies} hint={`avg ${formatEuros(avgOrderValue)}/order`} />
      </div>

      <div className="grid grid-cols-2 gap-3.5 mb-6">
        <Stat label="Codes sold (lifetime)" value={lifetimeCodes} />
        <Stat label="Codes sold (30d)" value={paid30d._sum.quantity ?? 0} />
      </div>

      <GlassPanel padding="lg">
        <div className="label mb-4">Breakdown by tier</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-glass-border">
                <th className="text-left label px-2 py-2.5">Tier</th>
                <th className="text-left label px-2 py-2.5">Orders</th>
                <th className="text-left label px-2 py-2.5">Codes</th>
                <th className="text-left label px-2 py-2.5">Revenue</th>
                <th className="text-left label px-2 py-2.5">Share</th>
              </tr>
            </thead>
            <tbody>
              {paidByTier
                .sort((a, b) => (b._sum.totalPriceCents ?? 0) - (a._sum.totalPriceCents ?? 0))
                .map((row) => {
                  const tier = getTier(row.packageType);
                  const share = lifetimeRevenue > 0
                    ? Math.round(((row._sum.totalPriceCents ?? 0) / lifetimeRevenue) * 100)
                    : 0;
                  return (
                    <tr key={row.packageType} className="border-b border-white/5">
                      <td className="px-2 py-2.5 font-display italic">{tier?.name ?? row.packageType}</td>
                      <td className="px-2 py-2.5 font-mono">{row._count}</td>
                      <td className="px-2 py-2.5 font-mono">{row._sum.quantity ?? 0}</td>
                      <td className="px-2 py-2.5 font-mono text-accent">
                        {formatEuros(row._sum.totalPriceCents ?? 0)}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-ink-dim">{share}%</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </Shell>
  );
}
