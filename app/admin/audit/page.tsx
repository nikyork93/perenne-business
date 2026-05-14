import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Badge, Whisper } from '@/components/ui';

const ACTION_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral'> = {
  'company.created':       'success',
  'company.updated':       'info',
  'cover.saved':           'accent',
  'order.paid':            'success',
  'order.refunded':        'warning',
  'distribution.created':  'info',
  'distribution.sent':     'success',
  'code.revoked':          'danger',
};

export const metadata = {
  title: 'Audit log',
};

export default async function AdminAuditPage() {
  const session = await requireRole('SUPERADMIN');

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      company: { select: { name: true, slug: true } },
    },
  });

  return (
    <Shell userEmail={session.email} isSuperAdmin={true}>
      <PageHeader
        eyebrow="Superadmin · Audit"
        title="Audit log"
        description="Last 200 actions across the platform. Used for forensics, compliance, and debugging."
      />

      <GlassPanel padding="none" className="overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-10">
            <Whisper>No audit events yet.</Whisper>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">When</th>
                  <th className="text-left label px-4 py-3">Actor</th>
                  <th className="text-left label px-4 py-3">Action</th>
                  <th className="text-left label px-4 py-3">Company</th>
                  <th className="text-left label px-4 py-3">Target</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-dim">
                      {l.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink-dim truncate max-w-[200px]" title={l.actorEmail}>
                        {l.actorEmail}
                      </div>
                      <div className="text-[10px] text-ink-faint">{l.actorRole}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ACTION_TONE[l.action] ?? 'neutral'}>{l.action}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      {l.company?.name ?? <span className="text-ink-faint">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-ink-faint">
                      {l.targetType && `${l.targetType}: ${l.targetId?.slice(0, 8)}…`}
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
