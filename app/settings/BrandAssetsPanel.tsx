'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassPanel, Button } from '@/components/ui';

interface BrandAssetsPanelProps {
  companyId: string;
  initialSymbolUrl: string | null;
  initialExtendedUrl: string | null;
  canEdit: boolean;
}

/**
 * Workspace brand assets editor. For now this is URL-based — we
 * expect the user to upload to R2 elsewhere (cover editor, asset
 * library) and paste the resulting URL here. A future iteration can
 * swap the inputs for an inline drag-and-drop uploader hitting the
 * same /api/company/:id endpoint with a multipart body.
 */
export function BrandAssetsPanel({
  companyId,
  initialSymbolUrl,
  initialExtendedUrl,
  canEdit,
}: BrandAssetsPanelProps) {
  const router = useRouter();
  const [symbolUrl, setSymbolUrl] = useState(initialSymbolUrl ?? '');
  const [extendedUrl, setExtendedUrl] = useState(initialExtendedUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/company/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logoSymbolUrl:   symbolUrl   || null,
          logoExtendedUrl: extendedUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save');
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full px-4 py-3 rounded-xl bg-surface-faint border border-glass-border text-ink text-sm font-mono placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-surface-hover transition';

  return (
    <div className="max-w-2xl space-y-4">
      <GlassPanel padding="lg">
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-ink mb-1">Symbol logo</h3>
            <p className="text-xs text-ink-dim mb-3">
              Square or 1:1 mark. Used as a workspace badge in the sidebar and as
              a fallback when a notebook design doesn't include a custom logo.
            </p>
            <div className="flex items-center gap-4">
              <div
                className="flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center bg-surface-faint border border-glass-border"
              >
                {symbolUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={symbolUrl} alt="Symbol" className="max-w-[48px] max-h-[48px] object-contain" />
                ) : (
                  <span className="text-[10px] text-ink-faint">—</span>
                )}
              </div>
              <input
                type="url"
                placeholder="https://…/logo-symbol.png"
                value={symbolUrl}
                onChange={(e) => setSymbolUrl(e.target.value)}
                disabled={!canEdit || saving}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink mb-1">Extended logo</h3>
            <p className="text-xs text-ink-dim mb-3">
              Wordmark or wide logo. Used on emails, invoices, and other places
              where a horizontal lockup reads better than the symbol alone.
            </p>
            <div className="flex items-center gap-4">
              <div
                className="flex-shrink-0 w-32 h-16 rounded-xl flex items-center justify-center bg-surface-faint border border-glass-border"
              >
                {extendedUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={extendedUrl} alt="Extended" className="max-w-[100px] max-h-[48px] object-contain" />
                ) : (
                  <span className="text-[10px] text-ink-faint">—</span>
                )}
              </div>
              <input
                type="url"
                placeholder="https://…/logo-extended.png"
                value={extendedUrl}
                onChange={(e) => setExtendedUrl(e.target.value)}
                disabled={!canEdit || saving}
                className={inputClass}
              />
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save brand assets'}
              </Button>
              {saved && (
                <span className="text-xs text-status-success">Saved.</span>
              )}
              {error && (
                <span className="text-xs text-status-danger">{error}</span>
              )}
            </div>
          )}
          {!canEdit && (
            <p className="text-xs text-ink-faint">
              You don't have permission to edit brand assets. Ask an OWNER or ADMIN.
            </p>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
