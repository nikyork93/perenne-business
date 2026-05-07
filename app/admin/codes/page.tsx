import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, GlassPanel, Badge } from '@/components/ui';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminCodesPage() {
  const session = await requireSession();
  if (session.role !== 'SUPERADMIN') {
    redirect('/dashboard');
  }

  const batches = await prisma.notebookCode.groupBy({
    by: ['companyId', 'batchLabel', 'designId'],
    _count: { _all: true },
    _min: { createdAt: true },
    where: {
      orderId: null,
      batchLabel: { not: null },
    },
    orderBy: { _min: { createdAt: 'desc' } },
  });

  const companyIds = Array.from(new Set(batches.map((b) => b.companyId)));
  const designIds = Array.from(
    new Set(batches.map((b) => b.designId).filter((d): d is string => !!d))
  );

  const [companies, designs, statusCounts] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true, slug: true },
    }),
    designIds.length > 0
      ? prisma.design.findMany({
          where: { id: { in: designIds } },
          select: { id: true, name: true, isArchived: true },
        })
      : Promise.resolve([]),
    prisma.notebookCode.groupBy({
      by: ['companyId', 'batchLabel', 'status'],
      _count: { _all: true },
      where: { orderId: null, batchLabel: { not: null } },
    }),
  ]);

  const companyMap = new Map(companies.map((c) => [c.id, c]));
  const designMap = new Map(designs.map((d) => [d.id, d]));

  type StatusBucket = { available: number; claimed: number; revoked: number };
  const statusByKey = new Map<string, StatusBucket>();
  for (const s of statusCounts) {
    const k = `${s.companyId}::${s.batchLabel}`;
    const b = statusByKey.get(k) ?? { available: 0, claimed: 0, revoked: 0 };
    if (s.status === 'AVAILABLE') b.available = s._count._all;
    if (s.status === 'CLAIMED') b.claimed = s._count._all;
    if (s.status === 'REVOKED') b.revoked = s._count._all;
    statusByKey.set(k, b);
  }

  return (
    <Shell userEmail={session.email} isSuperAdmin>
      <div className="max-w-7xl mx-auto p-8">
        <PageHeader
          eyebrow="Superadmin · Codes"
          title="Code batches"
          description="Manually-issued NotebookCode batches per company. Each batch can be linked to a Design."
          actions={
            <Link href="/admin/codes/new">
              <Button variant="primary">+ New batch</Button>
            </Link>
          }
        />

        <GlassPanel className="overflow-hidden">
          {batches.length === 0 ? (
            <div className="p-12 text-center text-ink-dim text-sm">
              No batches yet. Click <strong>New batch</strong> to issue codes
              to a company.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-faint text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono">
                <tr>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3">Company</th>
                  <th className="text-left px-4 py-3">Batch label</th>
                  <th className="text-left px-4 py-3">Design</th>
                  <th className="text-left px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Available</th>
                  <th className="text-left px-4 py-3">Claimed</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b, i) => {
                  const company = companyMap.get(b.companyId);
                  const design = b.designId ? designMap.get(b.designId) : null;
                  const k = `${b.companyId}::${b.batchLabel}`;
                  const buckets = statusByKey.get(k) ?? {
                    available: 0,
                    claimed: 0,
                    revoked: 0,
                  };
                  return (
                    <tr
                      key={i}
                      className="border-t border-border-subtle hover:bg-surface-hover"
                    >
                      <td className="px-4 py-3 text-ink-dim text-xs">
                        {b._min.createdAt
                          ? new Date(b._min.createdAt).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {company ? (
                          <Link
                            href={`/admin/companies/${company.id}`}
                            className="text-ink hover:text-accent"
                          >
                            {company.name}
                          </Link>
                        ) : (
                          <span className="text-ink-faint">deleted</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-dim">
                        {b.batchLabel ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-ink-dim text-xs">
                        {design ? (
                          design.name + (design.isArchived ? ' (archived)' : '')
                        ) : (
                          <span className="text-ink-faint">none</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink font-mono">
                        {b._count._all}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">{buckets.available}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="success">{buckets.claimed}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </GlassPanel>
      </div>
    </Shell>
  );
}
