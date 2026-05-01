'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GlassPanel, Button, Badge, Whisper } from '@/components/ui';
import { DesignThumbnail } from '@/components/designs/DesignThumbnail';
import type { DesignSummaryWithThumb } from '@/components/designs/types';

interface DesignsListProps {
  initialDesigns: DesignSummaryWithThumb[];
  canEdit: boolean;
}

export function DesignsList({ initialDesigns, canEdit }: DesignsListProps) {
  const router = useRouter();
  const [designs, setDesigns] = useState(initialDesigns);
  const [busy, setBusy] = useState<string | null>(null); // designId being mutated
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Refresh from server. Used after mutations that we don't want to
  // mirror locally (e.g. set-default flips isDefault on TWO rows).
  function refreshFromServer() {
    startTransition(() => router.refresh());
  }

  // Generic JSON action helper — surfaces server errors instead of
  // swallowing them. Same pattern as EditorClient's readJsonOrFail.
  async function callApi(
    method: 'POST' | 'DELETE',
    path: string,
    body?: object
  ): Promise<{ ok: boolean; data?: { error?: string; mode?: string } }> {
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        const text = await res.text().catch(() => '');
        console.error(`[${method} ${path}] non-JSON response`, {
          status: res.status,
          bodyPreview: text.slice(0, 300),
        });
        setError(`Server returned ${res.status} ${res.statusText}.`);
        return { ok: false };
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (HTTP ${res.status}).`);
        return { ok: false, data };
      }
      return { ok: true, data };
    } catch (err) {
      console.error(`[${method} ${path}] fetch failed`, err);
      setError(err instanceof Error ? err.message : 'Network error');
      return { ok: false };
    }
  }

  async function handleSetDefault(d: DesignSummaryWithThumb) {
    if (busy || d.isDefault) return;
    setBusy(d.id);
    const r = await callApi('POST', `/api/designs/${d.id}/set-default`);
    setBusy(null);
    if (r.ok) refreshFromServer();
  }

  async function handleDuplicate(d: DesignSummaryWithThumb) {
    if (busy) return;
    setBusy(d.id);
    const r = await callApi('POST', `/api/designs/${d.id}/duplicate`);
    setBusy(null);
    if (r.ok) refreshFromServer();
  }

  async function handleArchive(d: DesignSummaryWithThumb) {
    if (busy || d.isDefault) return;
    const isHardDelete = (d.orderCount ?? 0) === 0;
    const confirmMsg = isHardDelete
      ? `Delete "${d.name}"? This cannot be undone.`
      : `Archive "${d.name}"? Orders that used this design keep their snapshot — only the editable template is hidden.`;
    if (!confirm(confirmMsg)) return;

    setBusy(d.id);
    const r = await callApi('DELETE', `/api/designs/${d.id}`);
    setBusy(null);
    if (r.ok) {
      // Optimistic local removal. Server-truth via refresh too.
      setDesigns((prev) => prev.filter((x) => x.id !== d.id));
      refreshFromServer();
    }
  }

  if (designs.length === 0) {
    return (
      <GlassPanel padding="lg">
        <Whisper className="text-center py-8">
          No designs yet.{' '}
          {canEdit && (
            <>
              Create your first one to get started.
              <div className="mt-4">
                <Link href="/designs/new">
                  <Button variant="primary">+ New design</Button>
                </Link>
              </div>
            </>
          )}
        </Whisper>
      </GlassPanel>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-danger/5 border-danger/20 text-[#ff9a9a]">
          ✕ {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {designs.map((d) => {
          const isBusy = busy === d.id || isPending;
          return (
            <GlassPanel key={d.id} padding="md" animate>
              <div className="flex flex-col gap-3">
                {/* Thumbnail */}
                <Link
                  href={`/designs/${d.id}/edit`}
                  className="block relative group"
                  aria-label={`Edit ${d.name}`}
                >
                  <DesignThumbnail
                    backgroundColor={d.backgroundColor}
                    backgroundImageUrl={d.backgroundImageUrl}
                    primaryAssetUrl={d.primaryAssetUrl}
                    width={280}
                    className="w-full h-auto"
                  />
                  <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition bg-black/30 flex items-center justify-center">
                    <span className="text-xs font-mono text-white">Edit →</span>
                  </div>
                </Link>

                {/* Header: name + default badge */}
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display italic text-lg leading-tight truncate">
                      {d.name}
                    </h3>
                    <p className="mt-1 text-[10px] text-ink-faint font-mono">
                      {(d.orderCount ?? 0)} order{(d.orderCount ?? 0) === 1 ? '' : 's'}
                      {' · '}
                      updated {formatRelativeDate(d.updatedAt)}
                    </p>
                  </div>
                  {d.isDefault && <Badge tone="accent">Default</Badge>}
                </div>

                {/* Actions */}
                {canEdit && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-glass-border">
                    <Link href={`/designs/${d.id}/edit`} className="flex-1 min-w-[80px]">
                      <Button size="sm" block>
                        Edit
                      </Button>
                    </Link>
                    {!d.isDefault && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSetDefault(d)}
                        loading={isBusy}
                      >
                        Set default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDuplicate(d)}
                      loading={isBusy}
                    >
                      Duplicate
                    </Button>
                    {!d.isDefault && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleArchive(d)}
                        loading={isBusy}
                      >
                        {(d.orderCount ?? 0) === 0 ? 'Delete' : 'Archive'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </GlassPanel>
          );
        })}
      </div>
    </>
  );
}

// Tiny relative-date helper — avoids pulling date-fns just for this.
// Returns rough buckets: "today", "2d ago", "3w ago", "5mo ago", "Jan 2024"
function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  const day = 1000 * 60 * 60 * 24;
  if (diff < day) return 'today';
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
