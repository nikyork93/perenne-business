'use client';

import { useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GlassPanel, Button, Input, Textarea, SectionLabel, Whisper, Badge } from '@/components/ui';

interface Batch {
  id: string;
  fileName: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

interface Props {
  availableCodes: number;
  batches: Batch[];
  companyName: string;
}

type Mode = 'csv' | 'manual';

const EMAIL_REGEX = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

interface ParsedRecipient {
  email: string;
  name?: string;
  raw: string;       // original line as typed, for error display
  valid: boolean;
  duplicate?: boolean;
}

/**
 * Parse a free-form list of recipients typed by the user. Accepts one
 * per line in any of the common formats:
 *   - foo@bar.com
 *   - Mario Rossi <mario@bar.com>
 *   - mario@bar.com, Mario Rossi
 *   - mario@bar.com;Mario Rossi
 * Empty lines are ignored. Duplicate emails are marked but kept in the
 * list so the user sees what was filtered.
 */
function parseManualRecipients(input: string): ParsedRecipient[] {
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: ParsedRecipient[] = [];
  const seenEmails = new Set<string>();

  for (const line of lines) {
    let email = '';
    let name: string | undefined;

    // "Name <email>" form
    const angle = line.match(/^(.+?)\s*<\s*([^>]+)\s*>$/);
    if (angle) {
      name = angle[1].trim();
      email = angle[2].trim().toLowerCase();
    } else if (line.includes(',') || line.includes(';') || line.includes('\t')) {
      // "email, name" or "email;name" or "email\tname"
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      // Pick the first part that looks like an email
      const emailIdx = parts.findIndex((p) => EMAIL_REGEX.test(p));
      if (emailIdx !== -1) {
        email = parts[emailIdx].toLowerCase();
        const otherParts = parts.filter((_, i) => i !== emailIdx);
        if (otherParts.length > 0 && otherParts[0]) name = otherParts[0];
      } else {
        email = parts[0].toLowerCase();
      }
    } else {
      email = line.toLowerCase();
    }

    const valid = EMAIL_REGEX.test(email);
    const duplicate = valid && seenEmails.has(email);
    if (valid && !duplicate) seenEmails.add(email);

    out.push({ email, name, raw: line, valid, duplicate });
  }
  return out;
}

export function DistributionClient({ availableCodes, batches, companyName }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('csv');
  const [file, setFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');
  const [subject, setSubject] = useState(`Your ${companyName} notebook is ready`);
  const [body, setBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const parsed = useMemo(() => parseManualRecipients(manualText), [manualText]);
  const validCount = parsed.filter((r) => r.valid && !r.duplicate).length;
  const invalidCount = parsed.filter((r) => !r.valid).length;
  const duplicateCount = parsed.filter((r) => r.duplicate).length;

  async function handleSubmitCsv() {
    if (!file) return;
    setUploading(true);
    setFlash(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('subject', subject);
      fd.append('body', body);

      const res = await fetch('/api/distribution', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        const errs = data.csvErrors?.length
          ? ` (${data.csvErrors.length} CSV issues — check the file)`
          : '';
        setFlash({ type: 'err', msg: (data.error ?? 'Upload failed') + errs });
        return;
      }
      setFlash({
        type: 'ok',
        msg: `Batch ready: ${data.batch.totalRecipients} recipients. Review and send below.`,
      });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      router.refresh();
    } catch {
      setFlash({ type: 'err', msg: 'Network error.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmitManual() {
    const recipients = parsed.filter((r) => r.valid && !r.duplicate).map((r) => ({
      email: r.email,
      name: r.name,
    }));
    if (recipients.length === 0) return;
    setUploading(true);
    setFlash(null);
    try {
      const res = await fetch('/api/distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          recipients,
          subject,
          body,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: data.error ?? 'Failed to create batch.' });
        return;
      }
      setFlash({
        type: 'ok',
        msg: `Batch ready: ${data.batch.totalRecipients} recipients. Review and send below.`,
      });
      setManualText('');
      router.refresh();
    } catch {
      setFlash({ type: 'err', msg: 'Network error.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleSend(batchId: string) {
    if (!confirm('Send emails to all recipients now? This cannot be undone.')) return;
    setSending(batchId);
    setFlash(null);
    try {
      const res = await fetch(`/api/distribution/${batchId}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: data.error ?? 'Send failed.' });
        return;
      }
      setFlash({
        type: 'ok',
        msg: `Sent ${data.sent} emails. ${data.failed > 0 ? `(${data.failed} failed)` : ''}`,
      });
      router.refresh();
    } catch {
      setFlash({ type: 'err', msg: 'Network error.' });
    } finally {
      setSending(null);
    }
  }

  const canSubmit =
    !uploading &&
    availableCodes > 0 &&
    (mode === 'csv'
      ? !!file
      : validCount > 0);

  return (
    <>
      {flash && (
        <div
          className={`mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border ${
            flash.type === 'ok'
              ? 'bg-status-success border-status-success text-status-success'
              : 'bg-status-danger border-status-danger text-status-danger'
          }`}
        >
          {flash.type === 'ok' ? '✓ ' : '✕ '}
          {flash.msg}
        </div>
      )}

      <GlassPanel animate padding="lg" className="mb-6">
        <SectionLabel>New distribution</SectionLabel>

        {/* Mode selector */}
        <div
          role="tablist"
          aria-label="Input mode"
          className="flex items-center gap-1 p-1 mb-5 rounded-2xl border border-glass-border bg-surface-faint w-fit"
        >
          {(['csv', 'manual'] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium transition ${
                mode === m
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-ink-dim hover:text-ink hover:bg-surface-hover'
              }`}
            >
              {m === 'csv' ? '↑ CSV upload' : '✎ Type emails'}
            </button>
          ))}
        </div>

        {mode === 'csv' ? (
          <>
            <div className="mb-4 text-xs text-ink-dim leading-relaxed">
              Upload a CSV with columns <span className="font-mono">email</span>, <span className="font-mono">name</span> (optional),
              <span className="font-mono"> department</span> (optional). Each recipient gets one code from your available pool.
            </div>

            <div className="mb-4">
              <div className="label mb-2">CSV file</div>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="flex-1 text-xs text-ink-dim file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-glass-border file:bg-white/[0.06] file:text-ink file:text-xs file:font-medium file:cursor-pointer hover:file:bg-white/[0.1]"
                />
                {file && (
                  <span className="text-[11px] text-ink-faint font-mono">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 text-xs text-ink-dim leading-relaxed">
              Paste or type one email per line. Optional formats:
              <span className="font-mono ml-1">name &lt;email&gt;</span>,
              <span className="font-mono ml-1">email, name</span>,
              <span className="font-mono ml-1">email;name</span>. Duplicates and invalid lines are flagged.
            </div>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              rows={8}
              placeholder={`anna@stelvio.cc\nMario Rossi <mario@stelvio.cc>\nluca@stelvio.cc, Luca Bianchi`}
              className="w-full px-4 py-3 rounded-xl bg-surface-faint border border-glass-border text-ink text-sm font-mono leading-relaxed focus:outline-none focus:border-accent/50 transition mb-2"
              disabled={uploading}
            />
            {parsed.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded-md border border-glass-border bg-surface-faint text-ink-dim">
                  Total: {parsed.length}
                </span>
                <span className="px-2 py-0.5 rounded-md border border-status-success bg-status-success text-status-success">
                  Valid: {validCount}
                </span>
                {invalidCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md border border-status-danger bg-status-danger text-status-danger">
                    Invalid: {invalidCount}
                  </span>
                )}
                {duplicateCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md border border-status-warning bg-status-warning text-status-warning">
                    Duplicates: {duplicateCount}
                  </span>
                )}
              </div>
            )}
            {(invalidCount > 0 || duplicateCount > 0) && (
              <div className="mb-4 max-h-24 overflow-y-auto rounded-lg border border-glass-border bg-surface-faint p-2 text-[10px] font-mono space-y-0.5">
                {parsed.map((r, i) =>
                  !r.valid ? (
                    <div key={i} className="text-status-danger">
                      ✕ invalid: <span className="opacity-70">{r.raw}</span>
                    </div>
                  ) : r.duplicate ? (
                    <div key={i} className="text-status-warning">
                      ↻ duplicate: <span className="opacity-70">{r.email}</span>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 gap-4 mb-4">
          <Input
            label="Email subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Textarea
            label="Custom message (optional)"
            placeholder="Add a personal note from your team…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-glass-border">
          <span className="text-[11px] text-ink-faint font-mono">
            {availableCodes} codes available
            {mode === 'manual' && validCount > 0 && ` · using ${validCount}`}
          </span>
          <Button
            variant="primary"
            onClick={mode === 'csv' ? handleSubmitCsv : handleSubmitManual}
            loading={uploading}
            disabled={!canSubmit}
          >
            Create distribution batch
          </Button>
        </div>
      </GlassPanel>

      {/* Batches list */}
      <SectionLabel className="px-1">Past distributions</SectionLabel>
      <GlassPanel padding="none" className="overflow-hidden">
        {batches.length === 0 ? (
          <div className="p-10">
            <Whisper>No distributions yet. Add recipients above to send your first batch.</Whisper>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">Created</th>
                  <th className="text-left label px-4 py-3">Source</th>
                  <th className="text-left label px-4 py-3">Recipients</th>
                  <th className="text-left label px-4 py-3">Sent / Failed</th>
                  <th className="text-left label px-4 py-3">Status</th>
                  <th className="text-right label px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const tone =
                    b.status === 'COMPLETED' ? 'success' :
                    b.status === 'SENDING' ? 'info' :
                    b.status === 'FAILED' ? 'danger' :
                    b.status === 'DRAFT' ? 'warning' : 'neutral';
                  return (
                    <tr key={b.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-dim">
                        {new Date(b.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-ink-dim">
                        <a href={`/distribution/${b.id}`} className="hover:text-accent transition">
                          {b.fileName ?? '—'}
                        </a>
                      </td>
                      <td className="px-4 py-3 font-mono">{b.totalRecipients}</td>
                      <td className="px-4 py-3 font-mono">
                        <span className="text-status-success">{b.sentCount}</span>
                        {' / '}
                        <span className={b.failedCount > 0 ? 'text-status-danger' : 'text-ink-faint'}>
                          {b.failedCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={tone as 'success' | 'info' | 'danger' | 'warning' | 'neutral'}>
                          {b.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1.5">
                          {b.status === 'DRAFT' && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleSend(b.id)}
                              loading={sending === b.id}
                            >
                              Send now →
                            </Button>
                          )}
                          {b.status !== 'DRAFT' && (
                            <a
                              href={`/distribution/${b.id}`}
                              className="text-[11px] px-2 py-1 rounded border border-glass-border hover:border-ink-dim text-ink-dim hover:text-ink transition"
                            >
                              View →
                            </a>
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
      </GlassPanel>
    </>
  );
}
