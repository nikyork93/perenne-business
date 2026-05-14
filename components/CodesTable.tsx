'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CodeStatus } from '@prisma/client';
import { GlassPanel, Button, Input, Badge, Whisper } from '@/components/ui';
import { cn } from '@/lib/cn';

interface CodeEmailLog {
  id: string;
  batchId: string | null;
  recipientEmail: string;
  sentAt: string | null;
}

interface CodeRow {
  id: string;
  code: string;
  status: CodeStatus;
  assignedToEmail: string | null;
  assignedToName: string | null;
  claimedAt: string | null;
  claimedDeviceId: string | null;
  createdAt: string;
  orderId: string;
  distributionId: string | null;
  emailLogs: CodeEmailLog[];
}

const STATUS_TONE: Record<CodeStatus, 'success' | 'neutral' | 'danger'> = {
  CLAIMED: 'success',
  AVAILABLE: 'neutral',
  REVOKED: 'danger',
};

export function CodesTable() {
  const router = useRouter();
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CodeStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, pageSize: 50 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<CodeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      params.set('page', String(page));

      const res = await fetch(`/api/codes?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to load codes.');
        return;
      }
      setCodes(data.codes);
      setPagination(data.pagination);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => {
    const timeout = setTimeout(load, 200);
    return () => clearTimeout(timeout);
  }, [load]);

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => null);
  }

  async function handleAction(codeId: string, action: 'revoke' | 'restore') {
    const confirmMsg = action === 'revoke'
      ? 'Revoke this code? The assigned employee will no longer be able to activate it.'
      : 'Restore this code so it can be used again?';
    if (!confirm(confirmMsg)) return;

    setBusyId(codeId);
    try {
      const res = await fetch(`/api/codes/${codeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Action failed.');
        return;
      }
      setError(null);
      router.refresh();
      load();
    } catch {
      setError('Network error.');
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    window.location.href = `/api/codes/export?${params}`;
  }

  function deliveryBadge(c: CodeRow) {
    // CLAIMED beats everything: the user activated it.
    if (c.status === 'CLAIMED') return null;
    if (c.emailLogs.length > 0) {
      // The most recent send wins. If it has a batchId, label it
      // as "in batch" so the user can tell apart manual single-sends
      // from CSV-driven distributions.
      const log = c.emailLogs[0];
      return log.batchId ? (
        <Badge tone="info">Sent in batch</Badge>
      ) : (
        <Badge tone="success">Sent</Badge>
      );
    }
    // No EmailLog but distributionId set → batch was prepared but not
    // yet executed (or executed before EmailLog was tracked).
    if (c.distributionId) {
      return <Badge tone="info">In batch</Badge>;
    }
    return null;
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <Input
            label="Search"
            placeholder="PRN-… or email"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            mono
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <StatusFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
          <Link
            href="/distribution"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-accent text-white text-xs font-medium hover:bg-accent-bright transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
          >
            ⇉ Bulk distribute
          </Link>
          <Button onClick={exportCsv} variant="default">
            ↓ Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-status-danger border-status-danger text-status-danger">
          ✕ {error}
        </div>
      )}

      {/* Table */}
      <GlassPanel padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-10">
            <Whisper>Loading codes…</Whisper>
          </div>
        ) : codes.length === 0 ? (
          <div className="p-10">
            <Whisper>
              No codes found.{' '}
              {status || search ? 'Try adjusting filters, or ' : ''}
              {!status && !search && 'Head to the '}
              <a href="/store" className="underline hover:text-ink">Store</a>
              {(status || search) ? ' visit the Store' : ''} to buy your first pack.
            </Whisper>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">Code</th>
                  <th className="text-left label px-4 py-3">Status</th>
                  <th className="text-left label px-4 py-3">Delivery</th>
                  <th className="text-left label px-4 py-3">Assigned to</th>
                  <th className="text-left label px-4 py-3">Claimed</th>
                  <th className="text-left label px-4 py-3">Created</th>
                  <th className="text-right label px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const canSend = c.status === 'AVAILABLE';
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 font-mono">
                        <button
                          type="button"
                          onClick={() => copyCode(c.code)}
                          className="hover:text-accent transition-colors"
                          title="Click to copy"
                        >
                          {c.code}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[c.status]}>{c.status.toLowerCase()}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {deliveryBadge(c) ?? <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-dim">
                        {c.assignedToEmail ? (
                          <div>
                            <div>{c.assignedToName ?? '—'}</div>
                            <div className="text-[10px] text-ink-faint font-mono">{c.assignedToEmail}</div>
                          </div>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-dim font-mono text-[11px]">
                        {c.claimedAt ? new Date(c.claimedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-ink-dim font-mono text-[11px]">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {canSend && (
                            <button
                              type="button"
                              onClick={() => setSendTarget(c)}
                              className="text-[11px] px-2 py-1 rounded border border-accent/30 hover:border-accent/60 text-accent hover:text-accent-bright transition"
                              title="Send this code by email"
                            >
                              ✉ Send
                            </button>
                          )}
                          {c.status === 'AVAILABLE' && (
                            <button
                              type="button"
                              onClick={() => handleAction(c.id, 'revoke')}
                              disabled={busyId === c.id}
                              className="text-[11px] px-2 py-1 rounded border border-status-danger hover:border-danger text-status-danger hover:text-danger transition disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          )}
                          {c.status === 'REVOKED' && (
                            <button
                              type="button"
                              onClick={() => handleAction(c.id, 'restore')}
                              disabled={busyId === c.id}
                              className="text-[11px] px-2 py-1 rounded border border-glass-border hover:border-ink-dim text-ink-dim hover:text-ink transition disabled:opacity-50"
                            >
                              Restore
                            </button>
                          )}
                          {c.status === 'CLAIMED' && (
                            <span className="text-[10px] text-ink-faint">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-glass-border">
            <div className="text-[11px] text-ink-faint font-mono">
              {pagination.total} codes · page {page} of {pagination.totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prev
              </Button>
              <Button
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </GlassPanel>

      {sendTarget && (
        <SendCodeDialog
          code={sendTarget}
          onClose={() => setSendTarget(null)}
          onSent={() => {
            setSendTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: CodeStatus | '';
  onChange: (v: CodeStatus | '') => void;
}) {
  const options: Array<{ label: string; value: CodeStatus | '' }> = [
    { label: 'All', value: '' },
    { label: 'Available', value: CodeStatus.AVAILABLE },
    { label: 'Claimed', value: CodeStatus.CLAIMED },
    { label: 'Revoked', value: CodeStatus.REVOKED },
  ];
  return (
    <div className="flex gap-1 p-1 rounded-lg border border-glass-border bg-white/[0.03]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'text-[11px] px-2.5 py-1.5 rounded-md transition',
            value === o.value
              ? 'bg-accent/20 text-accent'
              : 'text-ink-dim hover:text-ink hover:bg-white/[0.05]'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface SendCodeDialogProps {
  code: CodeRow;
  onClose: () => void;
  onSent: () => void;
}

/**
 * Modal for sending a single code by email. If the code has already
 * been distributed (single-send or batch), shows a yellow notice and
 * requires the user to tick "Resend anyway" before the submit button
 * becomes active.
 */
function SendCodeDialog({ code, onClose, onSent }: SendCodeDialogProps) {
  const wasSentSingle = code.emailLogs.length > 0 && !code.emailLogs[0].batchId;
  const wasSentInBatch = code.emailLogs.length > 0 && code.emailLogs[0].batchId !== null;
  const inBatchNoLog = code.emailLogs.length === 0 && code.distributionId !== null;
  const requiresConfirm = wasSentSingle || wasSentInBatch || inBatchNoLog;

  const [email, setEmail] = useState(code.assignedToEmail ?? '');
  const [name, setName]   = useState(code.assignedToName ?? '');
  const [confirmResend, setConfirmResend] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (requiresConfirm && !confirmResend) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/codes/${code.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          confirmResend: requiresConfirm ? true : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'ALREADY_SENT' && !confirmResend) {
          setError(data.message || 'This code has already been sent.');
        } else {
          setError(data.error || 'Failed to send.');
        }
        return;
      }
      onSent();
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 shadow-2xl"
        style={{
          background: 'var(--glass-bg-hi)',
          border: '1px solid var(--glass-border)',
        }}
      >
        <div className="mb-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-1">
            Send code
          </div>
          <h2 className="text-lg font-medium text-ink">
            <span className="font-mono">{code.code}</span>
          </h2>
        </div>

        {requiresConfirm && (
          <div className="mb-4 py-2.5 px-3 rounded-lg text-[11px] border bg-status-warning border-status-warning text-status-warning">
            ⚠︎ This code was previously sent
            {wasSentInBatch || inBatchNoLog ? ' as part of a distribution batch' : ''}
            {code.emailLogs[0]?.recipientEmail ? (
              <> (to <span className="font-mono">{code.emailLogs[0].recipientEmail}</span>)</>
            ) : null}
            . Sending again will trigger a new email — the recipient will receive the
            same code, so they can both potentially activate the notebook.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] text-ink-dim font-medium mb-1.5">
              Recipient email
            </label>
            <input
              type="email"
              placeholder="employee@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              disabled={submitting}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-faint border border-glass-border text-ink text-sm font-mono focus:outline-none focus:border-accent/50 transition"
            />
          </div>

          <div>
            <label className="block text-[11px] text-ink-dim font-medium mb-1.5">
              Recipient name <span className="text-ink-faint">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="Mario Rossi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-faint border border-glass-border text-ink text-sm focus:outline-none focus:border-accent/50 transition"
            />
          </div>

          {requiresConfirm && (
            <label className="flex items-start gap-2 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={confirmResend}
                onChange={(e) => setConfirmResend(e.target.checked)}
                disabled={submitting}
                className="mt-1 accent-accent"
              />
              <span className="text-[11px] text-ink-dim">
                I understand — resend this code anyway
              </span>
            </label>
          )}

          {error && (
            <div className="py-2 px-3 rounded-lg text-[11px] border bg-status-danger border-status-danger text-status-danger">
              ✕ {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl border border-glass-border text-ink-dim hover:text-ink hover:border-ink-dim transition text-[12px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !email.trim() || (requiresConfirm && !confirmResend)}
              className="flex-1 px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent-bright transition text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending…' : '✉ Send code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
