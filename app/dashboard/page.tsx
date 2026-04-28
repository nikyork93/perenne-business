import Link from 'next/link';
import { redirect } from 'next/navigation';
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

  if (!session.companyId && session.role !== 'SUPERADMIN') {
    redirect('/onboarding');
  }
  if (!session.companyId && session.role === 'SUPERADMIN') {
    redirect('/admin/companies');
  }

  const companyId = session.companyId as string;

  const [
    company,
    coverConfig,
    totalCodes,
    claimedCodes,
    availableCodes,
    ordersCount,
    paidOrdersSum,
    recentOrders,
    recentActivity,
    lastDistribution,
  ] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.coverConfig.findFirst({ where: { companyId, isActive: true } }),
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

  // Onboarding state machine
  const step1Done = Boolean(coverConfig);
  const step2Done = totalCodes > 0;
  const step3Done = ordersCount > 0 && lastDistribution !== null;
  const isOnboarding = !step1Done || !step2Done || !step3Done;
  const isFresh = !step1Done && !step2Done && !step3Done;

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

        {/* Onboarding card — shown until all 3 steps are completed */}
        {isOnboarding && (
          <GlassPanel padding="lg" className="mb-6">
            <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
              <div>
                <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">
                  Get started
                </div>
                <h2 className="text-lg text-ink font-medium">
                  {isFresh
                    ? 'Three quick steps to go live with your branded notebooks'
                    : 'Continue your setup'}
                </h2>
              </div>
              <div className="text-[11px] font-mono text-ink-dim tracking-wider">
                {[step1Done, step2Done, step3Done].filter(Boolean).length} of 3 done
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <OnboardingStep
                num={1}
                title="Customize cover"
                description="Upload your logo and design the notebook cover your team will receive."
                href="/cover"
                cta="Open editor"
                state={
                  step1Done
                    ? 'completed'
                    : 'active'
                }
              />
              <OnboardingStep
                num={2}
                title="Buy codes"
                description="Choose a pack — 10 to 250 codes. Each code unlocks one notebook for life."
                href="/store"
                cta="View plans"
                state={
                  step2Done
                    ? 'completed'
                    : step1Done
                      ? 'active'
                      : 'locked'
                }
                lockedReason="Complete step 1 first"
              />
              <OnboardingStep
                num={3}
                title="Distribute"
                description="Upload a CSV of employee emails and send codes in one batch."
                href="/distribution"
                cta="Start distribution"
                state={
                  step3Done
                    ? 'completed'
                    : step1Done && step2Done
                      ? 'active'
                      : 'locked'
                }
                lockedReason="Complete steps 1 and 2 first"
              />
            </div>
          </GlassPanel>
        )}

        {/* Stats + activity — shown when at least step 2 is done */}
        {(step2Done || step3Done) && (
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
                  <div className="mt-4">
                    <Whisper>No activity yet.</Whisper>
                  </div>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {recentActivity.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-start gap-3 pb-3 border-b border-white/5 last:border-0"
                      >
                        <Badge tone={ACTION_TONE[a.action] ?? 'neutral'}>
                          {ACTION_LABEL[a.action] ?? a.action}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-ink-dim truncate">{a.actorEmail}</div>
                          <div className="text-[10px] text-ink-faint font-mono">
                            {new Date(a.createdAt).toLocaleString('en-GB', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
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
                    <Link
                      href="/billing"
                      className="text-[11px] text-ink-faint hover:text-ink"
                    >
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
                          <li
                            key={o.id}
                            className="flex items-center justify-between text-xs"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-display italic truncate">
                                {tier?.name ?? o.packageType}
                              </div>
                              <div className="text-[10px] text-ink-faint">
                                {new Date(o.createdAt).toLocaleDateString('en-GB')}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono">{formatEuros(o.totalPriceCents)}</div>
                              <Badge
                                tone={
                                  o.status === 'PAID'
                                    ? 'success'
                                    : o.status === 'PENDING'
                                      ? 'warning'
                                      : 'danger'
                                }
                              >
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
                      <Link
                        href={`/distribution/${lastDistribution.id}`}
                        className="font-medium hover:text-accent transition"
                      >
                        {lastDistribution.fileName ?? 'Untitled'}
                      </Link>
                      <div className="mt-2 flex items-center gap-4 text-ink-dim">
                        <span>{lastDistribution.totalRecipients} recipients</span>
                        <span className="text-emerald-300">
                          {lastDistribution.sentCount} sent
                        </span>
                        {lastDistribution.failedCount > 0 && (
                          <span className="text-[#ff9a9a]">
                            {lastDistribution.failedCount} failed
                          </span>
                        )}
                      </div>
                    </div>
                  </GlassPanel>
                )}

                {availableCodes < 10 && availableCodes > 0 && (
                  <GlassPanel padding="lg" className="border-accent/20 bg-accent/5">
                    <SectionLabel>Running low</SectionLabel>
                    <p className="mt-2 text-xs text-ink-dim mb-4">
                      Only {availableCodes} code{availableCodes !== 1 ? 's' : ''} left.
                    </p>
                    <Link href="/store">
                      <Button variant="primary" block size="sm">
                        Buy more codes →
                      </Button>
                    </Link>
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

// ─── Onboarding Step component ────────────────────────────────────

type StepState = 'active' | 'completed' | 'locked';

interface OnboardingStepProps {
  num: number;
  title: string;
  description: string;
  href: string;
  cta: string;
  state: StepState;
  lockedReason?: string;
}

function OnboardingStep({
  num,
  title,
  description,
  href,
  cta,
  state,
  lockedReason,
}: OnboardingStepProps) {
  // Active: highlighted with teal accent border + filled badge
  if (state === 'active') {
    return (
      <Link
        href={href}
        className="group block p-5 rounded-2xl border-2 border-accent/40 bg-accent/[0.06] hover:bg-accent/[0.10] hover:border-accent/60 transition-all hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-xs font-mono text-white w-6 h-6 rounded-full bg-accent flex items-center justify-center font-medium">
            {num}
          </span>
          <div className="text-[11px] font-mono uppercase tracking-widest text-accent-bright font-medium">
            {title}
          </div>
        </div>
        <p className="text-sm text-ink leading-relaxed mb-4 font-medium">{description}</p>
        <span className="text-[12px] text-accent-bright group-hover:text-accent font-medium inline-flex items-center gap-1">
          {cta}
          <span className="group-hover:translate-x-0.5 transition-transform">→</span>
        </span>
      </Link>
    );
  }

  // Completed: green check, dimmed but readable
  if (state === 'completed') {
    return (
      <Link
        href={href}
        className="group block p-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] hover:bg-emerald-400/[0.07] transition-all"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-xs text-white w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center font-medium">
            ✓
          </span>
          <div className="text-[11px] font-mono uppercase tracking-widest text-emerald-300/90 font-medium">
            {title}
          </div>
        </div>
        <p className="text-sm text-ink-dim leading-relaxed mb-4">{description}</p>
        <span className="text-[11px] text-emerald-300/70 group-hover:text-emerald-300 font-mono uppercase tracking-wider">
          completed · review
        </span>
      </Link>
    );
  }

  // Locked: muted but text still readable
  return (
    <div className="block p-5 rounded-2xl border border-glass-border bg-white/[0.015] cursor-not-allowed">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-xs font-mono text-ink-faint w-6 h-6 rounded-full border border-glass-hairline flex items-center justify-center">
          {num}
        </span>
        <div className="text-[11px] font-mono uppercase tracking-widest text-ink-faint font-medium">
          {title}
        </div>
      </div>
      <p className="text-sm text-ink-dim leading-relaxed mb-4">{description}</p>
      <span className="text-[11px] text-ink-faint font-mono inline-flex items-center gap-1.5">
        🔒 {lockedReason ?? 'Locked'}
      </span>
    </div>
  );
}
