'use client';

import { useState, useRef } from 'react';
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

export function DistributionClient({ availableCodes, batches, companyName }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState(`Your ${companyName} notebook is ready`);
  const [body, setBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  async function handleUpload() {
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

  return (
    <>
      {flash && (
        <div
          className={`mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border ${
            flash.type === 'ok'
              ? 'bg-status-success border-status-success text-status-success'
              : 'bg-danger/5 border-danger/20 text-[#ff9a9a]'
          }`}
        >
          {flash.type === 'ok' ? '✓ ' : '✕ '}
          {flash.msg}
        </div>
      )}

      {/* Upload panel */}
      <GlassPanel animate padding="lg" className="mb-6">
        <SectionLabel>New distribution</SectionLabel>

        <div className="mb-4 text-xs text-ink-dim leading-relaxed">
          Upload a CSV with columns <span className="font-mono">email</span>, <span className="font-mono">name</span> (optional),
          <span className="font-mono"> department</span> (optional). Each recipient will get one code from your available pool.
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
          </span>
          <Button
            variant="primary"
            onClick={handleUpload}
            loading={uploading}
            disabled={!file || uploading || availableCodes === 0}
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
            <Whisper>No distributions yet. Upload a CSV above to send your first batch.</Whisper>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">Created</th>
                  <th className="text-left label px-4 py-3">File</th>
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
                        <span className={b.failedCount > 0 ? 'text-[#ff9a9a]' : 'text-ink-faint'}>
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
