'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CodeStatus } from '@prisma/client';
import { GlassPanel, Button, Input, Badge } from '@/components/ui';

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

type Mode = 'idle' | 'assign' | 'csv' | 'distribute';

export function CodesTable() {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CodeStatus | ''>('');
  const [batchFilter, setBatchFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, pageSize: 50 });
  const [busyId, setBusyId] = useState<string | null>(null);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('idle');
  const [assigning, setAssigning] = useState<CodeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (batchFilter) params.set('batchLabel', batchFilter);
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
  }, [status, search, batchFilter, page]);

  useEffect(() => {
    const timeout = setTimeout(load, 200);
    return () => clearTimeout(timeout);
  }, [load]);

  // Available batch labels from current page (used in filter dropdown)
  const batchLabels = useMemo(() => {
    return Array.from(
      new Set(codes.map((c) => c.batchLabel).filter((b): b is string => !!b))
    ).sort();
  }, [codes]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      const visibleIds = codes.map((c) => c.id);
      const allSelected = visibleIds.every((id) => next.has(id));
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

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

  async function handleRevoke(c: CodeRow) {
    if (!confirm(`Revoke code ${c.code}? The recipient will lose access.`)) return;
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/codes/${c.id}/revoke`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Failed to revoke');
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(c: CodeRow) {
    if (!confirm(`Restore code ${c.code} to AVAILABLE?`)) return;
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/codes/${c.id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Failed to restore');
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const hasSelection = selected.size > 0;
  const visibleSelected = codes.filter((c) => selected.has(c.id));
  const eligibleForDistribute = visibleSelected.filter(
    (c) => c.status === 'AVAILABLE' && c.assignedToEmail
  );

  return (
    <div className="space-y-4">
      {/* Toolbar — filters + bulk actions */}
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
              className="px-3 py-2 rounded-md bg-glass-bg border border-glass-border text-ink text-sm"
            >
              <option value="">All</option>
              <option value="AVAILABLE">Available</option>
              <option value="CLAIMED">Claimed</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
          {batchLabels.length > 0 && (
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
                Batch
              </label>
              <select
                value={batchFilter}
                onChange={(e) => {
                  setBatchFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 rounded-md bg-glass-bg border border-glass-border text-ink text-sm"
              >
                <option value="">All batches</option>
                {batchLabels.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => setMode('csv')}>
              Import CSV
            </Button>
            <Button
              variant="primary"
              onClick={() => setMode('distribute')}
              disabled={eligibleForDistribute.length === 0 && !hasSelection}
              title={hasSelection ? `Send emails to ${eligibleForDistribute.length} selected` : 'Select assigned codes first'}
            >
              Send emails {hasSelection ? `(${eligibleForDistribute.length})` : ''}
            </Button>
          </div>
        </div>
        {hasSelection && (
          <div className="mt-3 pt-3 border-t border-border-subtle flex items-center gap-3 text-xs text-ink-dim">
            <span>{selected.size} selected</span>
            <button
              onClick={() => setSelected(new Set())}
              className="hover:text-ink underline underline-offset-2"
            >
              Clear selection
            </button>
          </div>
        )}
      </GlassPanel>

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
            <thead className="bg-surface-faint text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono">
              <tr>
                <th className="text-left px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={codes.length > 0 && codes.every((c) => selected.has(c.id))}
                    onChange={toggleAllVisible}
                    className="cursor-pointer"
                  />
                </th>
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
                <tr
                  key={c.id}
                  className={`border-t border-border-subtle hover:bg-surface-hover ${
                    selected.has(c.id) ? 'bg-surface-hover' : ''
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="cursor-pointer"
                    />
                  </td>
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
                  <td className="px-4 py-3 text-ink-dim text-xs">
                    {c.designName ?? <span className="text-ink-faint">—</span>}
                    {c.designArchived && (
                      <span className="ml-1 text-[10px] text-ink-faint">(archived)</span>
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
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                    {c.status === 'AVAILABLE' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => setAssigning(c)}
                      >
                        {c.assignedToEmail ? 'Reassign' : 'Assign'}
                      </Button>
                    )}
                    {c.status !== 'REVOKED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => handleRevoke(c)}
                      >
                        Revoke
                      </Button>
                    )}
                    {c.status === 'REVOKED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => handleRestore(c)}
                      >
                        Restore
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
            className="px-3 py-1 rounded border border-border-subtle disabled:opacity-30"
          >
            ← Prev
          </button>
          <div>
            Page {page} of {pagination.totalPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="px-3 py-1 rounded border border-border-subtle disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}

      {/* Modals */}
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

      {mode === 'csv' && (
        <CsvImportDialog
          batchLabels={batchLabels}
          onClose={() => setMode('idle')}
          onDone={() => {
            setMode('idle');
            load();
          }}
        />
      )}

      {mode === 'distribute' && (
        <DistributeDialog
          selectedIds={Array.from(selected)}
          eligibleCount={eligibleForDistribute.length}
          onClose={() => setMode('idle')}
          onDone={() => {
            setMode('idle');
            setSelected(new Set());
            load();
          }}
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
    <Modal onClose={onCancel}>
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
        <Button variant="primary" onClick={() => onSubmit(email, name)} disabled={busy}>
          {busy ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}

function CsvImportDialog({
  batchLabels,
  onClose,
  onDone,
}: {
  batchLabels: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [batchLabel, setBatchLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    assigned: number;
    skipped: Array<{ email: string; reason: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parseInline(text: string): Array<{ email: string; name?: string }> {
    // Accept CSV (with optional header) OR newline-separated emails
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    // Detect header
    const first = lines[0].toLowerCase();
    const hasHeader = first.includes('email');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines
      .map((line) => {
        const parts = line.split(',').map((s) => s.trim());
        const email = parts[0];
        const name = parts[1];
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
        return { email, name: name || undefined };
      })
      .filter((r): r is { email: string; name?: string } => r !== null);
  }

  async function handleSubmit() {
    setError(null);
    setResult(null);
    const recipients = parseInline(csvText);
    if (recipients.length === 0) {
      setError('No valid emails found.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/codes/bulk-assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchLabel: batchLabel || null,
          recipients,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.detail
            ? `${data.error}\n${JSON.stringify(data.detail, null, 2)}`
            : data.error ?? 'Failed'
        );
        return;
      }
      setResult({ assigned: data.assigned, skipped: data.skipped ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal onClose={onDone}>
        <h3 className="text-lg font-medium text-ink mb-4">Import complete</h3>
        <div className="space-y-3 text-sm text-ink-dim">
          <div>
            <strong className="text-ink">{result.assigned}</strong> codes assigned.
          </div>
          {result.skipped.length > 0 && (
            <div>
              <strong className="text-ink">{result.skipped.length}</strong> skipped:
              <ul className="mt-2 text-xs text-ink-faint max-h-40 overflow-y-auto space-y-1 ml-3">
                {result.skipped.slice(0, 20).map((s, i) => (
                  <li key={i}>
                    {s.email} — <em>{s.reason.replace(/_/g, ' ')}</em>
                  </li>
                ))}
                {result.skipped.length > 20 && (
                  <li className="text-ink-faint">… and {result.skipped.length - 20} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} wide>
      <h3 className="text-lg font-medium text-ink mb-2">Import recipients</h3>
      <p className="text-xs text-ink-dim mb-4">
        Paste a list of emails (one per line) or CSV (with <code>email,name</code> columns).
        Each recipient will be assigned one code from the available pool.
      </p>
      <div className="space-y-3">
        {batchLabels.length > 0 && (
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
              Use codes from batch (optional)
            </label>
            <select
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-glass-bg border border-glass-border text-ink text-sm"
            >
              <option value="">Any batch</option>
              {batchLabels.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
            Recipients
          </label>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={`email,name
mario@acme.com,Mario Rossi
luisa@acme.com,Luisa Bianchi
...`}
            rows={10}
            className="w-full px-3 py-2 rounded-md bg-glass-bg border border-glass-border text-ink text-sm font-mono"
          />
        </div>
        {error && (
          <div className="p-3 rounded border border-danger/30 bg-danger/10 text-danger text-xs whitespace-pre-wrap">
            {error}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={busy}>
          {busy ? 'Assigning...' : 'Assign codes'}
        </Button>
      </div>
    </Modal>
  );
}

function DistributeDialog({
  selectedIds,
  eligibleCount,
  onClose,
  onDone,
}: {
  selectedIds: string[];
  eligibleCount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [customMessage, setCustomMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    sent: number;
    failed: number;
    failures: Array<{ code: string; email: string; reason: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/codes/distribute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          codeIds: selectedIds,
          customMessage: customMessage.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed');
        return;
      }
      setResult({
        sent: data.sent ?? 0,
        failed: data.failed ?? 0,
        failures: data.failures ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal onClose={onDone}>
        <h3 className="text-lg font-medium text-ink mb-4">Emails sent</h3>
        <div className="space-y-3 text-sm text-ink-dim">
          <div>
            <strong className="text-ink">{result.sent}</strong> emails sent successfully.
          </div>
          {result.failed > 0 && (
            <div>
              <strong className="text-danger">{result.failed}</strong> failed:
              <ul className="mt-2 text-xs text-ink-faint max-h-40 overflow-y-auto space-y-1 ml-3">
                {result.failures.slice(0, 20).map((f, i) => (
                  <li key={i}>
                    {f.code} → {f.email}: <em>{f.reason}</em>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-medium text-ink mb-2">Send activation emails</h3>
      <p className="text-xs text-ink-dim mb-4">
        Sending to <strong className="text-ink">{eligibleCount}</strong> recipients
        (selected codes that are AVAILABLE + assigned + not previously emailed).
      </p>
      <div>
        <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
          Custom message (optional)
        </label>
        <textarea
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          placeholder="e.g. Welcome to the team! Use this code to set up your iPad notebook."
          rows={3}
          maxLength={500}
          className="w-full px-3 py-2 rounded-md bg-glass-bg border border-glass-border text-ink text-sm"
        />
        <div className="text-[10px] text-ink-faint mt-1">
          Appears as a quoted line at the top of the email.
        </div>
      </div>
      {error && (
        <div className="mt-3 p-3 rounded border border-danger/30 bg-danger/10 text-danger text-xs">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSend}
          disabled={busy || eligibleCount === 0}
        >
          {busy ? `Sending ${eligibleCount}...` : `Send ${eligibleCount} emails`}
        </Button>
      </div>
    </Modal>
  );
}

function Modal({
  children,
  onClose,
  wide,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className={`rounded-2xl p-6 w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--glass-bg-hi)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid var(--glass-hairline)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
