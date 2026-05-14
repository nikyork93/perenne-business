'use client';

import { useState } from 'react';
import { CoverEditor } from './CoverEditor';
import type { CoverConfigData } from '@/types/cover';

interface Props {
  initialConfig: CoverConfigData;
}

/**
 * Client wrapper around CoverEditor that handles:
 * - Saving config via POST /api/cover
 * - Uploading assets via POST /api/upload (stub for now, Step 6 will wire to R2)
 */
export function CoverEditorClient({ initialConfig }: Props) {
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  async function handleSave(config: CoverConfigData) {
    setFlash(null);
    try {
      const res = await fetch('/api/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: data.error ?? 'Save failed.' });
        return;
      }
      const warn = data.warnings?.join(' · ');
      setFlash({
        type: 'ok',
        msg: warn ? `Saved. Warning: ${warn}` : `Saved as version ${data.config.version}.`,
      });
    } catch {
      setFlash({ type: 'err', msg: 'Network error. Please retry.' });
    }
  }

  async function handleAssetUpload(file: File): Promise<{ url: string } | null> {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: `Upload failed: ${data.error ?? 'unknown'}` });
        return null;
      }
      return { url: data.asset.url };
    } catch {
      setFlash({ type: 'err', msg: 'Upload network error.' });
      return null;
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
      <CoverEditor
        initialConfig={initialConfig}
        onSave={handleSave}
        onAssetUpload={handleAssetUpload}
      />
    </>
  );
}
