'use client';

import { useState } from 'react';
import { CoverEditor } from './CoverEditor';
import { PageEditor } from './PageEditor';
import type { CoverConfigData, CoverAssetRef } from '@/types/cover';

interface Props {
  initialConfig: CoverConfigData;
  /**
   * If provided, the editor saves to PATCH /api/designs/[designId]
   * (the new design library endpoint). If omitted, it falls back to
   * POST /api/cover (the legacy endpoint, which dual-writes to both
   * the legacy CoverConfig table AND the company's default Design).
   * Practical use: every page in v27 should pass designId. The
   * fallback exists for any caller still using EditorClient outside
   * a Design context (defensive — there shouldn't be one).
   */
  designId?: string;
  /** Display-only — shown in flash messages */
  designName?: string;
  /** When true, hides save buttons / disables interactions */
  readOnly?: boolean;
}

type Tab = 'cover' | 'pages';

/**
 * EditorClient — tabbed editor wrapping CoverEditor and PageEditor.
 *
 * - Cover tab: design the notebook front cover (colors, logos, bg image, quote)
 * - Pages tab: design watermarks that appear on every page except "Property of"
 *
 * Each tab has its own internal state and Save button. Saves are independent
 * (cover save preserves watermarks; watermarks save preserves cover).
 *
 * Save endpoint:
 *   - if `designId` is provided → PATCH /api/designs/[designId]
 *   - else → POST /api/cover (legacy backward-compat path)
 *
 * The two endpoints have different request shapes so this component
 * picks the right body builder per case. They both return JSON
 * (validated by readJsonOrFail) so the UI flow is identical.
 */
export function EditorClient({
  initialConfig,
  designId,
  designName,
  readOnly,
}: Props) {
  const [tab, setTab] = useState<Tab>('cover');
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // ─── readJsonOrFail return type widened to also cover the
  //     PATCH /api/designs/[id] response ({ design: {...} })
  async function readJsonOrFail(
    res: Response,
    label: string
  ): Promise<
    | {
        ok: true;
        data: {
          config?: { version?: number };
          design?: { id?: string; name?: string };
          error?: string;
          warnings?: string[];
        };
      }
    | { ok: false; msg: string }
  > {
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      const text = await res.text().catch(() => '');
      console.error(`[${label}] non-JSON response`, {
        status: res.status,
        statusText: res.statusText,
        contentType: ct,
        bodyPreview: text.slice(0, 500),
      });
      return {
        ok: false,
        msg: `Server returned ${res.status} ${res.statusText} (not JSON). See console for details.`,
      };
    }
    try {
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      console.error(`[${label}] JSON parse failed`, err);
      return { ok: false, msg: 'Server returned invalid JSON. See console for details.' };
    }
  }

  async function saveCover(coverConfig: CoverConfigData) {
    if (readOnly) return;
    setFlash(null);
    let res: Response;
    try {
      // Design path (PATCH /api/designs/[id]) takes a partial Design
      // shape — assets/quote/etc as top-level fields. Legacy /api/cover
      // takes a wrapper shape with scope='cover'. Build the right one.
      const url = designId ? `/api/designs/${designId}` : '/api/cover';
      const method = designId ? 'PATCH' : 'POST';
      // For the design path: only send fields that the editor actively
      // owns. The CoverEditor doesn't currently expose a quote UI, so
      // we MUST NOT send `quote: null` for an unset quote — the PATCH
      // route would interpret null as "clear it" and wipe any quote
      // that was set elsewhere (e.g. from a previous editor version,
      // or from the legacy /api/cover endpoint). Skip the field
      // entirely when it's unset.
      const designBody: Record<string, unknown> = {
        backgroundColor: coverConfig.cover.backgroundColor,
        backgroundImageUrl: coverConfig.cover.backgroundImageUrl ?? null,
        assets: coverConfig.cover.assets,
      };
      if (coverConfig.cover.quote) {
        designBody.quote = {
          text: coverConfig.cover.quote.text,
          position: coverConfig.cover.quote.position,
          color: coverConfig.cover.quote.color,
        };
      }
      const body = designId
        ? JSON.stringify(designBody)
        : JSON.stringify({
            scope: 'cover',
            version: coverConfig.version,
            canvas: coverConfig.canvas,
            cover: coverConfig.cover,
          });
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (err) {
      console.error('[saveCover] fetch failed', err);
      const msg = err instanceof Error ? err.message : 'unreachable';
      setFlash({ type: 'err', msg: `Network error: ${msg}. Please retry.` });
      return;
    }

    const parsed = await readJsonOrFail(res, 'saveCover');
    if (!parsed.ok) {
      setFlash({ type: 'err', msg: parsed.msg });
      return;
    }
    const { data } = parsed;

    if (!res.ok) {
      setFlash({ type: 'err', msg: data.error ?? `Save failed (HTTP ${res.status}).` });
      return;
    }

    const warn = data.warnings?.join(' · ');
    const versionLabel = data.config?.version ?? '—';
    const successMsg = designId
      ? `Cover saved${designName ? ` for "${designName}"` : ''}.`
      : `Cover saved as version ${versionLabel}.`;
    setFlash({
      type: 'ok',
      msg: warn ? `${successMsg} Warning: ${warn}` : successMsg,
    });
  }

  async function saveWatermarks(watermarks: CoverAssetRef[]) {
    if (readOnly) return;
    setFlash(null);
    let res: Response;
    try {
      const url = designId ? `/api/designs/${designId}` : '/api/cover';
      const method = designId ? 'PATCH' : 'POST';
      const body = designId
        ? JSON.stringify({ pageWatermarks: watermarks })
        : JSON.stringify({ scope: 'pageWatermarks', pageWatermarks: watermarks });
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (err) {
      console.error('[saveWatermarks] fetch failed', err);
      const msg = err instanceof Error ? err.message : 'unreachable';
      setFlash({ type: 'err', msg: `Network error: ${msg}. Please retry.` });
      return;
    }

    const parsed = await readJsonOrFail(res, 'saveWatermarks');
    if (!parsed.ok) {
      setFlash({ type: 'err', msg: parsed.msg });
      return;
    }
    const { data } = parsed;

    if (!res.ok) {
      setFlash({ type: 'err', msg: data.error ?? `Save failed (HTTP ${res.status}).` });
      return;
    }

    const warn = data.warnings?.join(' · ');
    const versionLabel = data.config?.version ?? '—';
    const successMsg = designId
      ? `Watermarks saved${designName ? ` for "${designName}"` : ''}.`
      : `Watermarks saved as version ${versionLabel}.`;
    setFlash({
      type: 'ok',
      msg: warn ? `${successMsg} Warning: ${warn}` : successMsg,
    });
  }

  async function uploadFile(
    file: File,
    kind: 'asset' | 'background' | 'watermark'
  ): Promise<{ url: string } | null> {
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      // For uploads, surface failures so the user knows the file is
      // sitting in memory only (data URL) and won't survive a refresh.
      // Don't toast here — the calling editor renders the asset
      // optimistically via dataURL and this just decorates it with
      // the persistent URL. We log a warning if the server didn't
      // give us one.
      if (!res.ok) {
        console.warn('[uploadFile] non-OK response', { kind, status: res.status });
        return null;
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        const text = await res.text().catch(() => '');
        console.warn('[uploadFile] non-JSON response', { kind, status: res.status, bodyPreview: text.slice(0, 300) });
        return null;
      }
      const data = await res.json();
      if (!data.url) {
        console.warn('[uploadFile] response missing url', { kind, data });
        return null;
      }
      return { url: data.url };
    } catch (err) {
      console.warn('[uploadFile] fetch failed', { kind, err });
      return null;
    }
  }

  return (
    <>
      {/* ── Tabs ──────────────────────────────────────────────── */}
      <div
        className="flex gap-1 mb-4 p-1 rounded-xl border w-fit"
        style={{
          background: 'var(--surface-faint)',
          borderColor: 'var(--glass-border)',
        }}
      >
        <TabButton active={tab === 'cover'} onClick={() => setTab('cover')}>
          Cover
        </TabButton>
        <TabButton active={tab === 'pages'} onClick={() => setTab('pages')}>
          Pages
        </TabButton>
      </div>

      {/* ── Flash message ─────────────────────────────────────── */}
      {flash && (
        <div
          className={`mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border ${
            flash.type === 'ok'
              ? 'bg-emerald-400/5 border-emerald-400/20 text-emerald-300'
              : 'bg-danger/5 border-danger/20 text-[#ff9a9a]'
          }`}
        >
          {flash.type === 'ok' ? '✓ ' : '✕ '}
          {flash.msg}
        </div>
      )}

      {/* ── Editors — both stay mounted at all times ──────────
           Conditional rendering would unmount the inactive editor
           and lose all unsaved state (uploads, current selection,
           paper preview settings, default opacity, etc.). We keep
           both alive and toggle visibility via display:none, which
           preserves the React tree, the Fabric canvases, the file
           inputs and every piece of in-memory state. The trade-off
           is two Fabric canvases in memory at once; that's a few
           hundred KB and is negligible compared to the UX win.

           `isActive` is passed so each editor can gate global side
           effects (in particular keyboard shortcuts) — without it,
           pressing Arrow keys on the visible editor would also move
           the active object on the hidden editor. */}
      <div style={{ display: tab === 'cover' ? 'block' : 'none' }}>
        <CoverEditor
          initialConfig={initialConfig}
          // readOnly: pass undefined onSave so the Save button gets
          // disabled by the editor itself (it already checks `!onSave`
          // on the disabled prop). Same for upload handlers — we don't
          // want VIEWERs to upload to R2 either.
          onSave={readOnly ? undefined : saveCover}
          onAssetUpload={readOnly ? undefined : (file) => uploadFile(file, 'asset')}
          onBackgroundUpload={readOnly ? undefined : (file) => uploadFile(file, 'background')}
          isActive={tab === 'cover'}
        />
      </div>
      <div style={{ display: tab === 'pages' ? 'block' : 'none' }}>
        <PageEditor
          initialWatermarks={initialConfig.pageWatermarks ?? []}
          onSave={readOnly ? undefined : saveWatermarks}
          onAssetUpload={readOnly ? undefined : (file) => uploadFile(file, 'watermark')}
          isActive={tab === 'pages'}
        />
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-[11px] font-mono tracking-wider uppercase transition ${
        active
          ? 'bg-accent/15 text-accent border border-accent/30'
          : 'text-ink-dim hover:text-ink hover:bg-surface-hover border border-transparent'
      }`}
    >
      {children}
    </button>
  );
}
