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
  async function saveCover(coverConfig: CoverConfigData) {
    setFlash(null);
    try {
      const res = await fetch('/api/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'cover',
          version: coverConfig.version,
          canvas: coverConfig.canvas,
          cover: coverConfig.cover,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: data.error ?? 'Save failed.' });
        return;
      }
      const warn = data.warnings?.join(' · ');
      setFlash({
        type: 'ok',
        msg: warn
          ? `Cover saved. Warning: ${warn}`
          : `Cover saved as version ${data.config?.version ?? '—'}.`,
      });
    } catch {
      setFlash({ type: 'err', msg: 'Network error. Please retry.' });
    }
  }

  async function saveWatermarks(watermarks: CoverAssetRef[]) {
    setFlash(null);
    try {
      const res = await fetch('/api/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'pageWatermarks',
          pageWatermarks: watermarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: data.error ?? 'Save failed.' });
        return;
      }
      const warn = data.warnings?.join(' · ');
      setFlash({
        type: 'ok',
        msg: warn
          ? `Watermarks saved. Warning: ${warn}`
          : `Watermarks saved as version ${data.config?.version ?? '—'}.`,
      });
    } catch {
      setFlash({ type: 'err', msg: 'Network error. Please retry.' });
    }
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
      const data = await res.json();
      if (!res.ok || !data.url) return null;
      return { url: data.url };
    } catch {
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
              ? 'bg-status-success border-status-success text-status-success'
              : 'bg-danger/5 border-danger/20 text-[#ff9a9a]'
          }`}
        >
          {flash.type === 'ok' ? '✓ ' : '✕ '}
          {flash.msg}
        </div>
      )}

      {/* ── Active tab ────────────────────────────────────────── */}
      {tab === 'cover' ? (
        <CoverEditor
          initialConfig={initialConfig}
          onSave={saveCover}
          onAssetUpload={(file) => uploadFile(file, 'asset')}
          onBackgroundUpload={(file) => uploadFile(file, 'background')}
        />
      ) : (
        <PageEditor
          initialWatermarks={initialConfig.pageWatermarks ?? []}
          onSave={saveWatermarks}
          onAssetUpload={(file) => uploadFile(file, 'watermark')}
        />
      )}
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
