'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface Props {
  companyId: string;
  initialSymbolUrl: string | null;
  initialExtendedUrl: string | null;
}

/**
 * Admin-side logo uploaders for a specific company.
 *
 * Mirrors the customer-facing uploader from /settings/company, but
 * POSTs to /api/admin/companies/[id]/logo (scoped by URL param, not
 * by session). SUPERADMIN-only enforced server-side.
 */
export function CompanyLogoUploaders({
  companyId,
  initialSymbolUrl,
  initialExtendedUrl,
}: Props) {
  const router = useRouter();
  const [symbolUrl, setSymbolUrl] = useState(initialSymbolUrl);
  const [extendedUrl, setExtendedUrl] = useState(initialExtendedUrl);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(variant: 'symbol' | 'extended', file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('variant', variant);
      fd.append('file', file);
      const res = await fetch(`/api/admin/companies/${companyId}/logo`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Upload failed (HTTP ${res.status})`);
        return;
      }
      if (variant === 'symbol') setSymbolUrl(data.url);
      else setExtendedUrl(data.url);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 text-danger p-3 text-sm">
          {error}
        </div>
      )}

      <LogoSlot
        variant="symbol"
        label="Symbol logo"
        hint="Square / compact mark."
        currentUrl={symbolUrl}
        onUpload={(file) => upload('symbol', file)}
        disabled={busy || pending}
      />
      <LogoSlot
        variant="extended"
        label="Extended logo"
        hint="Wordmark + symbol."
        currentUrl={extendedUrl}
        onUpload={(file) => upload('extended', file)}
        disabled={busy || pending}
      />
    </div>
  );
}

function LogoSlot({
  variant,
  label,
  hint,
  currentUrl,
  onUpload,
  disabled,
}: {
  variant: 'symbol' | 'extended';
  label: string;
  hint: string;
  currentUrl: string | null;
  onUpload: (file: File) => void;
  disabled: boolean;
}) {
  const inputId = `admin-logo-upload-${variant}`;
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
        {label}
      </label>
      <div className="flex items-center gap-4 p-3 rounded-lg border border-input-border bg-input-bg/50">
        <div
          className="w-20 h-20 rounded border border-glass-border bg-surface flex items-center justify-center overflow-hidden flex-shrink-0"
          style={variant === 'extended' ? { width: 140 } : undefined}
        >
          {currentUrl ? (
            <Image
              src={currentUrl}
              alt={label}
              width={variant === 'extended' ? 140 : 80}
              height={80}
              className="object-contain max-w-full max-h-full"
              unoptimized
            />
          ) : (
            <span className="text-[9px] text-ink-faint uppercase tracking-widest">no logo</span>
          )}
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="text-[11px] text-ink-faint">{hint}</div>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = '';
              }}
            />
            <label
              htmlFor={inputId}
              className={`inline-flex items-center px-3 py-1.5 rounded-md border border-glass-border bg-surface text-xs cursor-pointer hover:border-accent transition ${
                disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {currentUrl ? 'Replace' : 'Upload'}
            </label>
            <span className="text-[10px] text-ink-faint">PNG, JPEG, SVG, WebP · max 5MB</span>
          </div>
        </div>
      </div>
    </div>
  );
}
