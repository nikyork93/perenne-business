import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Badge, Button } from '@/components/ui';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect, notFound } from 'next/navigation';
import { BatchDesignPicker } from '@/components/admin/BatchDesignPicker';

export const dynamic = 'force-dynamic';

/**
 * /codes/[batchLabel] — single-batch detail.
 *
 * Customer enters a batch and sees:
 *   1. The design selector at the top (BatchDesignPicker — same
 *      component used by superadmin /admin/codes).
 *   2. The list of individual codes (status, claimedAt, optional
 *      assignee fields).
 *
 * Permissions: OWNER/ADMIN/MEMBER of the company can VIEW. Only
 * OWNER/ADMIN/SUPERADMIN can MUTATE — enforced by the
 * assign-design API.
 *
 * Why batchLabel as the URL slug (not batch id): batches don't have
 * a row in the database, they're just a groupBy projection. The
 * label is the natural identifier the customer sees, and we already
 * use it as the unique join key with companyId.
 */
export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchLabel: string }>;
}) {
  const session = await requireSession();
  if (!session.companyId) redirect('/dashboard');
  const companyId = session.companyId;

  const { batchLabel: raw } = await params;
  const batchLabel = decodeURIComponent(raw);

  // Codes in this batch (scoped by company)
  const codes = await prisma.notebookCode.findMany({
    where: { companyId, batchLabel },
    select: {
      id: true,
      code: true,
      status: true,
      assignedToEmail: true,
      assignedToName: true,
      claimedAt: true,
      designId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (codes.length === 0) notFound();

  // Determine the "current" design for the batch. If codes within the
  // batch disagree (rare; only happens if a partial reassignment
  // happened via SQL), we take the most common one and flag a
  // warning.
  const designIdCounts = new Map<string | null, number>();
  for (const c of codes) {
    designIdCounts.set(c.designId, (designIdCounts.get(c.designId) ?? 0) + 1);
  }
  const currentDesignId =
    [...designIdCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const isMixed = designIdCounts.size > 1;

  const [design, designs, company] = await Promise.all([
    currentDesignId
      ? prisma.design.findUnique({
          where: { id: currentDesignId },
          select: { id: true, name: true, isArchived: true, backgroundColor: true },
        })
      : Promise.resolve(null),
    prisma.design.findMany({
      where: { companyId, isArchived: false },
      select: { id: true, name: true, isArchived: true },
      orderBy: { name: 'asc' },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, logoSymbolUrl: true },
    }),
  ]);

  const counts = codes.reduce(
    (acc, c) => {
      if (c.status === 'AVAILABLE') acc.available++;
      else if (c.status === 'CLAIMED') acc.claimed++;
      else if (c.status === 'REVOKED') acc.revoked++;
      return acc;
    },
    { available: 0, claimed: 0, revoked: 0 }
  );

  return (
    <Shell
      companyName={company?.name}
      companyLogoUrl={company?.logoSymbolUrl ?? null}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <div className="max-w-6xl mx-auto p-8 space-y-6">
        <div>
          <Link
            href="/codes"
            className="text-xs text-ink-faint hover:text-ink-dim transition mb-3 inline-block"
          >
            ← All batches
          </Link>
          <PageHeader
            eyebrow="Batch"
            title={batchLabel}
            description={`${codes.length} codes · ${counts.available} available · ${counts.claimed} claimed`}
          />
        </div>

        {/* Design assignment panel */}
        <GlassPanel className="p-6">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono">
                Design
              </div>
              <div className="text-xs text-ink-dim max-w-md">
                Link a design to this batch. Every code in the batch will
                activate the chosen design on the iPad. Changes propagate
                to already-activated notebooks at next launch.
              </div>
              {isMixed && (
                <div className="text-[11px] text-warning mt-2">
                  ⚠ This batch has codes pointing to different designs. Pick
                  one to normalize.
                </div>
              )}
            </div>
            <div className="min-w-[240px]">
              <BatchDesignPicker
                companyId={companyId}
                batchLabel={batchLabel}
                currentDesignId={currentDesignId}
                currentDesignName={
                  design
                    ? design.name + (design.isArchived ? ' (archived)' : '')
                    : null
                }
                options={designs}
              />
            </div>
          </div>
        </GlassPanel>

        {/* Codes table */}
        <GlassPanel className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-faint text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono">
              <tr>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Assigned to</th>
                <th className="text-left px-4 py-3">Claimed at</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-border-subtle hover:bg-surface-hover"
                >
                  <td className="px-4 py-3 font-mono text-xs text-ink">
                    {c.code}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        c.status === 'CLAIMED'
                          ? 'success'
                          : c.status === 'REVOKED'
                          ? 'danger'
                          : 'neutral'
                      }
                    >
                      {c.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-dim text-xs">
                    {c.assignedToName || c.assignedToEmail || (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-dim text-xs">
                    {c.claimedAt ? (
                      new Date(c.claimedAt).toLocaleString()
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      </div>
    </Shell>
  );
}
