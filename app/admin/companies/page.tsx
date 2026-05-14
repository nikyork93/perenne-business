import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Badge, Whisper } from '@/components/ui';
import { formatEuros } from '@/lib/pricing';

export const metadata = {
  title: 'Companies',
};

export default async function AdminCompaniesPage() {
  const session = await requireRole('SUPERADMIN');

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
    city: c.city,
    vatNumber: c.vatNumber,
    users: c._count.users,
    codes: c._count.notebookCodes,
    orders: c._count.orders,
    revenueCents: c.orders.reduce((s, o) => s + o.totalPriceCents, 0),
    createdAt: c.createdAt,
  }));

  return (
    <Shell userEmail={session.email} isSuperAdmin={true}>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <PageHeader
          eyebrow="Superadmin"
          title="All companies"
          description={`${enriched.length} compan${enriched.length === 1 ? 'y' : 'ies'} onboarded. Cross-cutting view — only visible to Perenne team.`}
        />
        <Link
          href="/admin/companies/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-accent text-white text-sm font-medium hover:bg-accent-bright transition-all shadow-lg shadow-accent/20 hover:-translate-y-0.5 self-start"
        >
          + New company
        </Link>
      </div>

      <GlassPanel padding="none" className="overflow-hidden">
        {enriched.length === 0 ? (
          <div className="p-10 text-center">
            <Whisper>No companies onboarded yet.</Whisper>
            <p className="text-xs text-ink-faint mt-3">
              Click <strong className="text-ink-dim">+ New company</strong> to onboard your first one.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">Company</th>
                  <th className="text-left label px-4 py-3">Location</th>
                  <th className="text-left label px-4 py-3">VAT</th>
                  <th className="text-left label px-4 py-3">Users</th>
                  <th className="text-left label px-4 py-3">Codes</th>
                  <th className="text-left label px-4 py-3">Orders</th>
                  <th className="text-left label px-4 py-3">Revenue</th>
                  <th className="text-left label px-4 py-3">Joined</th>
                  <th className="text-left label px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-display italic text-sm">{c.name}</div>
                      <div className="text-[10px] text-ink-faint font-mono">{c.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{c.country}</Badge>
                      {c.city && (
                        <div className="text-[10px] text-ink-faint mt-0.5">{c.city}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-dim">
                      {c.vatNumber || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono">{c.users}</td>
                    <td className="px-4 py-3 font-mono">{c.codes}</td>
                    <td className="px-4 py-3 font-mono">{c.orders}</td>
                    <td className="px-4 py-3 font-mono text-accent-bright">
                      {formatEuros(c.revenueCents)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-dim">
                      {c.createdAt.toLocaleDateString('en-GB', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/companies/${c.id}/edit`}
                        className="text-[11px] text-accent-bright hover:text-accent transition font-mono"
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      <div className="mt-6 flex gap-3">
        <Link href="/admin/users" className="text-[11px] text-ink-faint hover:text-ink transition font-mono">
          ↗ Users management
        </Link>
        <Link href="/admin/revenue" className="text-[11px] text-ink-faint hover:text-ink transition font-mono">
          ↗ Revenue dashboard
        </Link>
        <Link href="/admin/audit" className="text-[11px] text-ink-faint hover:text-ink transition font-mono">
          ↗ Audit log
        </Link>
      </div>
    </Shell>
  );
}
