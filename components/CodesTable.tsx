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
  assignedAt: string | null;
  claimedAt: string | null;
  claimedDeviceId: string | null;
  createdAt: string;
  orderId: string | null;
  batchLabel: string | null;
  notes: string | null;
  designId: string | null;
  designName: string | null;
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
  const [assigning, setAssigning] = useState<CodeRow | null>(null);

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

  async function handleAssignSubmit(email: string, name: string) {
    if (!assigning) return;
    setBusyId(assigning.id);
    try {
      const trimmedEmail = email.trim();
      const res = await fetch(`/api/codes/${assigning.id}/assign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail || null,
          name: name.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Failed to assign');
        return;
      }
      setAssigning(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <GlassPanel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
              Search
            </label>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="code, email, name, batch..."
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as CodeStatus | '');
                setPage(1);
              }}
              className="px-3 py-2 rounded-md bg-input-bg border border-input-border text-ink text-sm"
            >
              <option value="">All</option>
              <option value="AVAILABLE">Available</option>
              <option value="CLAIMED">Claimed</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
          <div className="ml-auto text-xs text-ink-dim">
            {pagination.total} {pagination.total === 1 ? 'code' : 'codes'}
          </div>
        </div>
      </GlassPanel>

      {/* Error */}
      {error && (
        <div className="p-3 rounded border border-danger/30 bg-danger/10 text-danger text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <GlassPanel className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-ink-dim text-sm">Loading...</div>
        ) : codes.length === 0 ? (
          <div className="p-12 text-center text-ink-dim text-sm">
            No codes yet. Codes appear here when a Superadmin issues a batch to your company.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2/50 text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono">
              <tr>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Design</th>
                <th className="text-left px-4 py-3">Batch</th>
                <th className="text-left px-4 py-3">Assigned to</th>
                <th className="text-left px-4 py-3">Claimed</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-t border-divider hover:bg-surface-2/30">
                  <td className="px-4 py-3 font-mono text-ink">
                    <button
                      onClick={() => copyCode(c.code)}
                      className="hover:text-accent transition-colors"
                      title="Click to copy"
                    >
                      {c.code}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-dim">
                    {c.designName ?? <span className="text-ink-faint">—</span>}
                    {c.designArchived && (
                      <span className="ml-2 text-[10px] text-ink-faint">(archived)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-dim text-xs">
                    {c.batchLabel ?? <span className="text-ink-faint">—</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-dim text-xs">
                    {c.assignedToEmail ? (
                      <div>
                        <div>{c.assignedToEmail}</div>
                        {c.assignedToName && (
                          <div className="text-ink-faint">{c.assignedToName}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-dim text-xs">
                    {c.claimedAt ? new Date(c.claimedAt).toLocaleDateString() : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status !== 'CLAIMED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => setAssigning(c)}
                      >
                        {c.assignedToEmail ? 'Reassign' : 'Assign'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassPanel>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-ink-dim">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded border border-divider disabled:opacity-30"
          >
            ← Prev
          </button>
          <div>
            Page {page} of {pagination.totalPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="px-3 py-1 rounded border border-divider disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}

      {/* Assign dialog */}
      {assigning && (
        <AssignDialog
          code={assigning.code}
          currentEmail={assigning.assignedToEmail}
          currentName={assigning.assignedToName}
          busy={busyId === assigning.id}
          onCancel={() => setAssigning(null)}
          onSubmit={handleAssignSubmit}
        />
      )}
    </div>
  );
}

function AssignDialog({
  code,
  currentEmail,
  currentName,
  busy,
  onCancel,
  onSubmit,
}: {
  code: string;
  currentEmail: string | null;
  currentName: string | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (email: string, name: string) => void;
}) {
  const [email, setEmail] = useState(currentEmail ?? '');
  const [name, setName] = useState(currentName ?? '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-surface-1 border border-divider rounded-lg p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
          Code {code}
        </div>
        <h3 className="text-lg font-medium text-ink mb-4">
          {currentEmail ? 'Reassign code' : 'Assign code'}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
              Recipient email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="employee@company.com"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
              Name (optional)
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mario Rossi"
            />
          </div>
          <div className="text-xs text-ink-faint">
            Leave email empty to <strong>unassign</strong>.
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onSubmit(email, name)}
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
