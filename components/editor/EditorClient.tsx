'use client';

import { useState } from 'react';
import { CoverEditor } from './CoverEditor';
import { PageEditor } from './PageEditor';
import type { CoverConfigData, CoverAssetRef } from '@/types/cover';

interface Props {
  initialConfig: CoverConfigData;
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
 * Both POST to /api/cover but only update their respective fields. Each save
 * creates a new CoverConfig version.
 */
export function EditorClient({ initialConfig }: Props) {
  const [tab, setTab] = useState<Tab>('cover');
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // ─── API helpers ───────────────────────────────────────────────────
  // Both save flows share the same response-handling pattern:
  //
  //   1. fetch — catches connectivity errors (DNS, timeout, CORS, etc)
  //   2. content-type check — detects when the server returned HTML
  //      (a Next.js 404/500 error page) instead of JSON. Without this
  //      check, res.json() throws a SyntaxError and we mislabel the
  //      failure as "Network error".
  //   3. JSON parse — catches truly malformed JSON
  //   4. res.ok — surfaces the server's `{ error }` body for non-2xx
  //
  // Every failure path also logs to the console with the raw response
  // text so a curious user can hand-deliver the cause when reporting.

  async function readJsonOrFail(
    res: Response,
    label: string
  ): Promise<{ ok: true; data: { config?: { version?: number }; error?: string; warnings?: string[] } } | { ok: false; msg: string }> {
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
    setFlash(null);
    let res: Response;
    try {
      res = await fetch('/api/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'cover',
          version: coverConfig.version,
          canvas: coverConfig.canvas,
          cover: coverConfig.cover,
        }),
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
    setFlash({
      type: 'ok',
      msg: warn
        ? `Cover saved. Warning: ${warn}`
        : `Cover saved as version ${data.config?.version ?? '—'}.`,
    });
  }

  async function saveWatermarks(watermarks: CoverAssetRef[]) {
    setFlash(null);
    let res: Response;
    try {
      res = await fetch('/api/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'pageWatermarks',
          pageWatermarks: watermarks,
        }),
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
    setFlash({
      type: 'ok',
      msg: warn
        ? `Watermarks saved. Warning: ${warn}`
        : `Watermarks saved as version ${data.config?.version ?? '—'}.`,
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
          onSave={saveCover}
          onAssetUpload={(file) => uploadFile(file, 'asset')}
          onBackgroundUpload={(file) => uploadFile(file, 'background')}
          isActive={tab === 'cover'}
        />
      </div>
      <div style={{ display: tab === 'pages' ? 'block' : 'none' }}>
        <PageEditor
          initialWatermarks={initialConfig.pageWatermarks ?? []}
          onSave={saveWatermarks}
          onAssetUpload={(file) => uploadFile(file, 'watermark')}
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
