import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Badge, Whisper } from '@/components/ui';
import { formatEuros } from '@/lib/pricing';

export default async function AdminCompaniesPage() {
  const session = await requireRole('SUPERADMIN');

  // Aggregate stats per company
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          users: true,
          notebookCodes: true,
          orders: true,
        },
      },
      orders: {
        where: { status: 'PAID' },
        select: { totalPriceCents: true },
      },
    },
  });

  const enriched = companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    country: c.country ?? '—',
    users: c._count.users,
    codes: c._count.notebookCodes,
    orders: c._count.orders,
    revenueCents: c.orders.reduce((s, o) => s + o.totalPriceCents, 0),
    createdAt: c.createdAt,
  }));

  return (
    <Shell
      userEmail={session.email}
      isSuperAdmin={true}
    >
      <PageHeader
        eyebrow="Superadmin"
        title="All companies"
        description={`${enriched.length} companies total. Cross-cutting view — only visible to Perenne team.`}
      />

      <GlassPanel padding="none" className="overflow-hidden">
        {enriched.length === 0 ? (
          <div className="p-10">
            <Whisper>No companies onboarded yet.</Whisper>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">Company</th>
                  <th className="text-left label px-4 py-3">Country</th>
                  <th className="text-left label px-4 py-3">Users</th>
                  <th className="text-left label px-4 py-3">Codes</th>
                  <th className="text-left label px-4 py-3">Orders</th>
                  <th className="text-left label px-4 py-3">Revenue</th>
                  <th className="text-left label px-4 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-display italic text-sm">{c.name}</div>
                      <div className="text-[10px] text-ink-faint font-mono">{c.slug}</div>
                    </td>
                    <td className="px-4 py-3"><Badge tone="neutral">{c.country}</Badge></td>
                    <td className="px-4 py-3 font-mono">{c.users}</td>
                    <td className="px-4 py-3 font-mono">{c.codes}</td>
                    <td className="px-4 py-3 font-mono">{c.orders}</td>
                    <td className="px-4 py-3 font-mono text-accent">
                      {formatEuros(c.revenueCents)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-dim">
                      {c.createdAt.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      <div className="mt-6 flex gap-3">
        <Link href="/admin/revenue" className="btn">↗ Revenue dashboard</Link>
        <Link href="/admin/audit" className="btn">↗ Audit log</Link>
      </div>
    </Shell>
  );
}
