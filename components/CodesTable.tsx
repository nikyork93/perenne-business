'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CodeStatus } from '@prisma/client';
import { GlassPanel, Button, Input, Badge, Whisper } from '@/components/ui';
import { cn } from '@/lib/cn';

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
  /** Design the code is locked to (the order's snapshot). Null for pre-migration orders. */
  designId: string | null;
  designName: string | null;
  /** True if the source design has been archived. The code's snapshot is unaffected, but we badge it for transparency. */
  designArchived: boolean;
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
    const timeout = setTimeout(load, 200); // light debounce for search input
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
          <Button onClick={exportCsv} variant="default">
            ↓ Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-danger/5 border-danger/20 text-[#ff9a9a]">
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
                  <th className="text-left label px-4 py-3">Design</th>
                  <th className="text-left label px-4 py-3">Assigned to</th>
                  <th className="text-left label px-4 py-3">Claimed</th>
                  <th className="text-left label px-4 py-3">Created</th>
                  <th className="text-right label px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
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
                    <td className="px-4 py-3 text-ink-dim text-[11px]">
                      {/* Design name (read-only — comes from the order's
                          frozen designSnapshotJson; the editable source
                          is only shown for context). Designs that were
                          archived after the batch was sold get a small
                          tag — the snapshot is still valid, but the
                          editable template is no longer in the library. */}
                      {c.designName ? (
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[140px]" title={c.designName}>
                            {c.designName}
                          </span>
                          {c.designArchived && (
                            <span className="text-[9px] uppercase tracking-wider text-ink-faint font-mono">
                              archived
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
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
                      {c.status === 'AVAILABLE' && (
                        <button
                          type="button"
                          onClick={() => handleAction(c.id, 'revoke')}
                          disabled={busyId === c.id}
                          className="text-[11px] px-2 py-1 rounded border border-danger/30 hover:border-danger/60 text-[#ff9a9a] hover:text-danger transition disabled:opacity-50"
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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
