import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Stat, Badge, Whisper, Button, SectionLabel } from '@/components/ui';
import { formatEuros, getTier } from '@/lib/pricing';

const ACTION_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral'> = {
  'company.created':       'success',
  'company.updated':       'info',
  'cover.saved':           'accent',
  'order.paid':            'success',
  'order.refunded':        'warning',
  'distribution.created':  'info',
  'distribution.sent':     'success',
  'distribution.resent':   'info',
  'code.revoked':          'danger',
  'code.restored':         'info',
  'code.claimed':          'success',
  'team.invited':          'accent',
  'team.removed':          'warning',
  'team.role_changed':     'info',
};

const ACTION_LABEL: Record<string, string> = {
  'company.created':       'Company created',
  'company.updated':       'Company updated',
  'cover.saved':           'Cover saved',
  'order.paid':            'Order paid',
  'order.refunded':        'Order refunded',
  'distribution.created':  'Batch created',
  'distribution.sent':     'Batch sent',
  'distribution.resent':   'Batch retried',
  'code.revoked':          'Code revoked',
  'code.restored':         'Code restored',
  'code.claimed':          'Code activated',
  'team.invited':          'Team invite sent',
  'team.removed':          'Team member removed',
  'team.role_changed':     'Role changed',
};

export default async function DashboardPage() {
  const session = await requireSession();

  if (!session.companyId! && session.role !== 'SUPERADMIN') {
    const { redirect } = await import('next/navigation');
    redirect('/onboarding');
  }

  if (!session.companyId! && session.role === 'SUPERADMIN') {
    const { redirect } = await import('next/navigation');
    redirect('/admin/companies');
  }

  const companyId = session.companyId!;

  const [company, totalCodes, claimedCodes, availableCodes, ordersCount, paidOrdersSum, recentOrders, recentActivity, lastDistribution] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.notebookCode.count({ where: { companyId } }),
    prisma.notebookCode.count({ where: { companyId, status: 'CLAIMED' } }),
    prisma.notebookCode.count({ where: { companyId, status: 'AVAILABLE' } }),
    prisma.order.count({ where: { companyId, status: 'PAID' } }),
    prisma.order.aggregate({
      where: { companyId, status: 'PAID' },
      _sum: { totalPriceCents: true },
    }),
    prisma.order.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
    prisma.auditLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.distributionBatch.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const claimRate = totalCodes > 0 ? Math.round((claimedCodes / totalCodes) * 100) : 0;
  const totalSpentCents = paidOrdersSum._sum.totalPriceCents ?? 0;
  const isEmpty = totalCodes === 0 && ordersCount === 0;

  return (
    <Shell
      companyName={company?.name}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <div className="max-w-5xl">
        <PageHeader
          eyebrow="Overview"
          title={`Welcome${session.name ? `, ${session.name}` : ''}`}
          description={
            company
              ? `Managing ${company.name}. ${availableCodes} codes ready for distribution.`
              : 'Your company dashboard'
          }
        />

        {isEmpty ? (
          <GlassPanel padding="lg" className="mb-6">
            <SectionLabel>Get started</SectionLabel>
            <p className="mt-3 mb-6 text-sm text-ink-dim leading-relaxed">
              Three quick steps to go live with your branded notebooks.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <OnboardingStep num="1" title="Customize cover" description="Upload your logo and design the notebook cover your team will receive." href="/cover" cta="Open editor" />
              <OnboardingStep num="2" title="Buy codes" description="Choose a pack — 10 to 250 codes. Each code unlocks one notebook for life." href="/store" cta="View plans" />
              <OnboardingStep num="3" title="Distribute" description="Upload a CSV of employee emails and send codes in one batch." href="/distribution" cta="Start distribution" disabled />
            </div>
          </GlassPanel>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
              <Stat label="Total codes" value={totalCodes} hint={`${ordersCount} orders`} />
              <Stat label="Claimed" value={claimedCodes} hint={`${claimRate}% activation`} />
              <Stat label="Available" value={availableCodes} hint="ready to distribute" />
              <Stat label="Total spent" value={formatEuros(totalSpentCents)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5">
              <GlassPanel padding="lg">
                <SectionLabel>Recent activity</SectionLabel>
                {recentActivity.length === 0 ? (
                  <div className="mt-4"><Whisper>No activity yet.</Whisper></div>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {recentActivity.map((a) => (
                      <li key={a.id} className="flex items-start gap-3 pb-3 border-b border-white/5 last:border-0">
                        <Badge tone={ACTION_TONE[a.action] ?? 'neutral'}>
                          {ACTION_LABEL[a.action] ?? a.action}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-ink-dim truncate">{a.actorEmail}</div>
                          <div className="text-[10px] text-ink-faint font-mono">
                            {new Date(a.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </GlassPanel>

              <div className="space-y-3.5">
                <GlassPanel padding="lg">
                  <div className="flex items-center justify-between mb-3">
                    <SectionLabel>Recent orders</SectionLabel>
                    <Link href="/billing" className="text-[11px] text-ink-faint hover:text-ink">
                      View all →
                    </Link>
                  </div>
                  {recentOrders.length === 0 ? (
                    <Whisper>No orders yet.</Whisper>
                  ) : (
                    <ul className="space-y-2.5">
                      {recentOrders.map((o) => {
                        const tier = getTier(o.packageType);
                        return (
                          <li key={o.id} className="flex items-center justify-between text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="font-display italic truncate">{tier?.name ?? o.packageType}</div>
                              <div className="text-[10px] text-ink-faint">
                                {new Date(o.createdAt).toLocaleDateString('en-GB')}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono">{formatEuros(o.totalPriceCents)}</div>
                              <Badge tone={o.status === 'PAID' ? 'success' : o.status === 'PENDING' ? 'warning' : 'danger'}>
                                {o.status.toLowerCase()}
                              </Badge>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </GlassPanel>

                {lastDistribution && (
                  <GlassPanel padding="lg">
                    <SectionLabel>Last distribution</SectionLabel>
                    <div className="mt-3 text-xs">
                      <Link href={`/distribution/${lastDistribution.id}`} className="font-medium hover:text-accent transition">
                        {lastDistribution.fileName ?? 'Untitled'}
                      </Link>
                      <div className="mt-2 flex items-center gap-4 text-ink-dim">
                        <span>{lastDistribution.totalRecipients} recipients</span>
                        <span className="text-emerald-300">{lastDistribution.sentCount} sent</span>
                        {lastDistribution.failedCount > 0 && (
                          <span className="text-[#ff9a9a]">{lastDistribution.failedCount} failed</span>
                        )}
                      </div>
                    </div>
                  </GlassPanel>
                )}

                {availableCodes < 10 && availableCodes > 0 && (
                  <GlassPanel padding="lg" className="border-accent/20 bg-accent/5">
                    <SectionLabel>Running low</SectionLabel>
                    <p className="mt-2 text-xs text-ink-dim mb-4">
                      Only {availableCodes} code{availableCodes !== 1 ? 's' : ''} left. Buy another pack to keep onboarding employees.
                    </p>
                    <Link href="/store"><Button variant="primary" block size="sm">Buy more codes →</Button></Link>
                  </GlassPanel>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function OnboardingStep({
  num, title, description, href, cta, disabled,
}: {
  num: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  disabled?: boolean;
}) {
  return (
    <div className={`p-4 rounded-lg border ${disabled ? 'border-glass-border/50 opacity-60' : 'border-glass-border bg-white/[0.02]'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-mono text-accent w-5 h-5 rounded-full border border-accent/30 flex items-center justify-center">
          {num}
        </span>
        <div className="label">{title}</div>
      </div>
      <p className="text-[11px] text-ink-dim leading-relaxed mb-3">{description}</p>
      {disabled ? (
        <span className="text-[10px] text-ink-faint">complete steps 1–2 first</span>
      ) : (
        <Link href={href} className="text-[11px] text-accent hover:underline">{cta} →</Link>
      )}
    </div>
  );
}
