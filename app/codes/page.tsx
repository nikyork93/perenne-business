import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Button } from '@/components/ui';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /codes — customer-facing batch overview.
 *
 * Replaces v37's single flat table. Now batches are first-class:
 *   - One card per batch (grouped by batchLabel + designId combination
 *     within the company). The card surfaces the most important info:
 *     name, # of codes, design status, breakdown.
 *   - Clicking a card opens /codes/[batchLabel], where the customer can
 *     attach/swap the design and see the individual codes.
 *
 * Why batches instead of codes-first: customers buy batches, design
 * them with us, then distribute. Showing 200 individual codes upfront
 * is noise — the batch is the unit they actually think about.
 *
 * Scope: only batches belonging to the user's company. Server filter,
 * not just UI — the prisma query has companyId hard-coded to the
 * session.
 */
export default async function CodesPage() {
  const session = await requireSession();
  if (!session.companyId) {
    redirect('/dashboard');
  }
  const companyId = session.companyId;

  // Group by batchLabel + designId. We GROUP BY designId too because the
  // same batchLabel could conceivably have rows with different designs
  // (e.g. partial reassignment via SQL); we want each combination as a
  // separate card so the UI is unambiguous.
  const batches = await prisma.notebookCode.groupBy({
    by: ['batchLabel', 'designId'],
    where: {
      companyId,
      batchLabel: { not: null },
    },
    _count: { _all: true },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: 'desc' } },
  });

  // Status counts per batchLabel (sum across designs if multiple)
  const statusCounts = await prisma.notebookCode.groupBy({
    by: ['batchLabel', 'status'],
    where: { companyId, batchLabel: { not: null } },
    _count: { _all: true },
  });

  type Bucket = { available: number; claimed: number; revoked: number };
  const statusByLabel = new Map<string, Bucket>();
  for (const s of statusCounts) {
    if (!s.batchLabel) continue;
    const cur = statusByLabel.get(s.batchLabel) ?? { available: 0, claimed: 0, revoked: 0 };
    if (s.status === 'AVAILABLE') cur.available = s._count._all;
    if (s.status === 'CLAIMED') cur.claimed = s._count._all;
    if (s.status === 'REVOKED') cur.revoked = s._count._all;
    statusByLabel.set(s.batchLabel, cur);
  }

  // Load designs referenced. Need name + thumbnail (we just use bg color
  // here for a visual hint — full thumbnail is on the detail page).
  const designIds = batches.map((b) => b.designId).filter((d): d is string => !!d);
  const designs = designIds.length
    ? await prisma.design.findMany({
        where: { id: { in: designIds } },
        select: {
          id: true,
          name: true,
          isArchived: true,
          backgroundColor: true,
        },
      })
    : [];
  const designById = new Map(designs.map((d) => [d.id, d]));

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, logoSymbolUrl: true },
  });

  return (
    <Shell
      companyName={company?.name}
      companyLogoUrl={company?.logoSymbolUrl ?? null}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <div className="max-w-7xl mx-auto p-8">
        <PageHeader
          eyebrow="Distribution"
          title="Code batches"
          description="Each batch is a purchase. Link a design to your batch, then distribute the codes to your team."
          actions={
            <Link href="/store">
              <Button variant="primary">+ Purchase batch</Button>
            </Link>
          }
        />

        {batches.length === 0 ? (
          <GlassPanel className="p-12 text-center">
            <div className="space-y-4">
              <div className="text-sm text-ink-dim">
                No batches yet. Purchase a code pack to get started.
              </div>
              <Link href="/store">
                <Button variant="primary">Go to store</Button>
              </Link>
            </div>
          </GlassPanel>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batches.map((b) => {
              const design = b.designId ? designById.get(b.designId) : null;
              const buckets = statusByLabel.get(b.batchLabel ?? '') ?? {
                available: 0,
                claimed: 0,
                revoked: 0,
              };
              const totalForThisRow = b._count._all;
              const href = `/codes/${encodeURIComponent(b.batchLabel ?? '')}`;
              return (
                <Link
                  key={`${b.batchLabel}-${b.designId ?? 'none'}`}
                  href={href}
                  className="group block"
                >
                  <GlassPanel className="p-5 h-full transition-all group-hover:border-accent/40 group-hover:-translate-y-0.5">
                    <div className="space-y-4">
                      {/* Cover preview strip — shown only when a design is linked. */}
                      {design && (
                        <div
                          className="aspect-[16/6] rounded-lg border border-glass-border relative overflow-hidden"
                          style={{ background: design.backgroundColor ?? 'var(--surface-faint)' }}
                        />
                      )}

                      <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
                          {b._min.createdAt
                            ? new Date(b._min.createdAt).toLocaleDateString()
                            : 'Batch'}
                        </div>
                        <div className="text-base font-medium text-ink truncate">
                          {b.batchLabel ?? 'Untitled batch'}
                        </div>
                        <div className="text-xs text-ink-dim mt-0.5">
                          {design ? (
                            <>Design: {design.name}{design.isArchived && ' (archived)'}</>
                          ) : (
                            <span className="italic text-ink-faint">No design assigned</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs">
                        <Stat label="Total" value={totalForThisRow} />
                        <Stat label="Available" value={buckets.available} tone="neutral" />
                        <Stat label="Claimed" value={buckets.claimed} tone="success" />
                      </div>
                    </div>
                  </GlassPanel>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'neutral';
}) {
  const valueColor =
    tone === 'success'
      ? 'text-success'
      : tone === 'neutral'
      ? 'text-ink-dim'
      : 'text-ink';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-faint font-mono">
        {label}
      </div>
      <div className={`text-base font-medium ${valueColor}`}>{value}</div>
    </div>
  );
}
