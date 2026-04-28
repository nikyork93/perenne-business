import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Stat, Badge, Whisper } from '@/components/ui';
import { BatchDetailActions } from '@/components/BatchDetailActions';
import type { EmailStatus } from '@prisma/client';

interface Props { params: Promise<{ id: string }>; }

const EMAIL_TONE: Record<EmailStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  SENT: 'success',
  DELIVERED: 'success',
  OPENED: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  BOUNCED: 'danger',
};

export default async function DistributionDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await requireSession();
  if (!session.companyId!) {
    const { redirect } = await import('next/navigation');
    redirect('/onboarding');
  }

  const batch = await prisma.distributionBatch.findUnique({
    where: { id },
    include: {
      emailLogs: {
        orderBy: { createdAt: 'desc' },
      },
      company: { select: { name: true } },
    },
  });

  if (!batch || (batch!.companyId !== session.companyId! && session.role !== 'SUPERADMIN')) {
    const { notFound } = await import('next/navigation');
    notFound();
  }

  // Dedupe logs by recipientEmail, keeping the most recent attempt per email
  // (one email may have multiple logs if resend-failed was called)
  const latestPerRecipient = new Map<string, typeof batch!.emailLogs[0]>();
  for (const log of batch!.emailLogs) {
    const existing = latestPerRecipient.get(log.recipientEmail);
    if (!existing || log.createdAt > existing.createdAt) {
      latestPerRecipient.set(log.recipientEmail, log);
    }
  }
  const uniqueLogs = Array.from(latestPerRecipient.values());

  const currentSent = uniqueLogs.filter((l) => l.status === 'SENT' || l.status === 'DELIVERED' || l.status === 'OPENED').length;
  const currentFailed = uniqueLogs.filter((l) => l.status === 'FAILED' || l.status === 'BOUNCED').length;
  const currentPending = uniqueLogs.filter((l) => l.status === 'PENDING').length;

  const canManage = session.role === 'OWNER' || session.role === 'ADMIN' || session.role === 'SUPERADMIN';

  return (
    <Shell
      companyName={batch!.company.name}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Distribution"
        title={batch!.fileName ?? 'Untitled batch'}
        description={`Created ${batch!.createdAt.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' })} · ${batch!.status.toLowerCase()}`}
        actions={
          <Link href="/distribution" className="text-xs text-ink-faint hover:text-ink transition">
            ← All batches
          </Link>
        }
      />

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <Stat label="Recipients" value={batch!.totalRecipients} />
        <Stat label="Sent" value={currentSent} hint={`of ${batch!.totalRecipients}`} />
        <Stat label="Failed" value={currentFailed} hint={currentFailed > 0 && canManage ? 'retriable' : undefined} />
        <Stat label="Pending" value={currentPending} />
      </div>

      {currentFailed > 0 && canManage && (
        <BatchDetailActions batchId={batch.id} failedCount={currentFailed} />
      )}

      <GlassPanel padding="none" className="overflow-hidden mt-6">
        {uniqueLogs.length === 0 ? (
          <div className="p-10">
            <Whisper>
              This batch hasn&apos;t been sent yet. Go to{' '}
              <Link href="/distribution" className="underline hover:text-ink">Distribution</Link> to send it.
            </Whisper>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">Recipient</th>
                  <th className="text-left label px-4 py-3">Status</th>
                  <th className="text-left label px-4 py-3">Sent at</th>
                  <th className="text-left label px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody>
                {uniqueLogs.map((l) => (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{l.recipientName ?? '—'}</div>
                      <div className="text-[10px] text-ink-faint font-mono">{l.recipientEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={EMAIL_TONE[l.status]}>{l.status.toLowerCase()}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-dim">
                      {l.sentAt
                        ? new Date(l.sentAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
                        : <span className="text-ink-faint">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[#ff9a9a] max-w-[300px] truncate" title={l.errorMessage ?? ''}>
                      {l.errorMessage ?? <span className="text-ink-faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </Shell>
  );
}
