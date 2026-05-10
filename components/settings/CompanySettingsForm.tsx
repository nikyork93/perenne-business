'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export interface CompanyShape {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  address: string | null;
  city: string | null;
  zipCode: string | null;
  country: string | null;
  sdiCode: string | null;
  pecEmail: string | null;
  logoSymbolUrl: string | null;
  logoExtendedUrl: string | null;
  primaryColor: string | null;
}

interface Props {
  /** Server-rendered initial state. The form mutates locally and
   * pushes via PATCH; on success the server data and local state
   * agree. */
  initial: CompanyShape;
}

export function CompanySettingsForm({ initial }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<CompanyShape>(initial);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function set<K extends keyof CompanyShape>(key: K, val: CompanyShape[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    // Diff against `initial` so we only PATCH fields that actually changed.
    // PATCH semantics: undefined fields are not touched server-side.
    const patch: Partial<CompanyShape> = {};
    for (const key of Object.keys(draft) as (keyof CompanyShape)[]) {
      if (key === 'id' || key === 'slug') continue;
      if (key === 'logoSymbolUrl' || key === 'logoExtendedUrl') continue; // logos via separate endpoint
      if (draft[key] !== initial[key]) {
        // Cast through unknown is unavoidable because Partial<CompanyShape> has narrower types per key
        (patch as Record<string, unknown>)[key] = draft[key];
      }
    }
    if (Object.keys(patch).length === 0) {
      setMessage({ kind: 'ok', text: 'Nothing to save.' });
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/company/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'err', text: data.error ?? `Failed (HTTP ${res.status})` });
        return;
      }
      setMessage({ kind: 'ok', text: 'Saved.' });
      // Refresh server components (e.g. the sidebar that shows the
      // company name) without a full reload.
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(variant: 'symbol' | 'extended', file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('variant', variant);
      fd.append('file', file);
      const res = await fetch('/api/company/me/logo', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'err', text: data.error ?? `Upload failed (HTTP ${res.status})` });
        return;
      }
      // Update local state with new URL so the preview flips
      // immediately without a re-fetch.
      const updatedField = variant === 'symbol' ? 'logoSymbolUrl' : 'logoExtendedUrl';
      setDraft((d) => ({ ...d, [updatedField]: data.url }));
      setMessage({ kind: 'ok', text: 'Logo uploaded.' });
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.kind === 'ok'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-danger/30 bg-danger/10 text-danger'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ─── Company info ──────────────────────────────────────── */}
      <Section title="Company info" subtitle="Used on invoices, distribution emails, and the iPad welcome screen.">
        <Field label="Display name" required>
          <Input value={draft.name} onChange={(v) => set('name', v)} />
        </Field>
        <Field label="Legal name" hint="The official registered name (e.g. for invoices).">
          <Input value={draft.legalName ?? ''} onChange={(v) => set('legalName', v || null)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="VAT number">
            <Input value={draft.vatNumber ?? ''} onChange={(v) => set('vatNumber', v || null)} />
          </Field>
          <Field label="Tax code (codice fiscale)">
            <Input value={draft.taxCode ?? ''} onChange={(v) => set('taxCode', v || null)} />
          </Field>
        </div>

        <Field label="Address">
          <Input value={draft.address ?? ''} onChange={(v) => set('address', v || null)} />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="City">
            <Input value={draft.city ?? ''} onChange={(v) => set('city', v || null)} />
          </Field>
          <Field label="ZIP">
            <Input value={draft.zipCode ?? ''} onChange={(v) => set('zipCode', v || null)} />
          </Field>
          <Field label="Country" hint="ISO 2-letter (IT, CH…)">
            <Input
              value={draft.country ?? ''}
              onChange={(v) => set('country', v ? v.toUpperCase().slice(0, 2) : null)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="SDI code (Italy e-invoicing)">
            <Input value={draft.sdiCode ?? ''} onChange={(v) => set('sdiCode', v || null)} />
          </Field>
          <Field label="PEC email (Italy)">
            <Input value={draft.pecEmail ?? ''} onChange={(v) => set('pecEmail', v || null)} />
          </Field>
        </div>
      </Section>

      {/* ─── Brand assets ──────────────────────────────────────── */}
      <Section
        title="Brand assets"
        subtitle="Your logo appears on the iPad welcome screen, distribution emails, and in the sidebar of this portal."
      >
        <LogoUploader
          variant="symbol"
          label="Symbol logo"
          hint="Square / compact mark. Used in tight spaces and as the email favicon."
          currentUrl={draft.logoSymbolUrl}
          onUpload={(file) => uploadLogo('symbol', file)}
          disabled={busy}
        />

        <LogoUploader
          variant="extended"
          label="Extended logo"
          hint="Wordmark + symbol. Used as the company badge in this sidebar and on iPad welcome."
          currentUrl={draft.logoExtendedUrl}
          onUpload={(file) => uploadLogo('extended', file)}
          disabled={busy}
        />

        <Field label="Primary brand color" hint="Hex like #1a1a1a. Used as a default for new designs.">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={draft.primaryColor ?? '#1a1a1a'}
              onChange={(e) => set('primaryColor', e.target.value)}
              className="w-12 h-9 rounded border border-input-border cursor-pointer"
            />
            <Input
              value={draft.primaryColor ?? ''}
              onChange={(v) => set('primaryColor', v || null)}
              placeholder="#1a1a1a"
            />
          </div>
        </Field>
      </Section>

      {/* ─── Save ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 sticky bottom-4 z-10">
        <button
          type="button"
          onClick={save}
          disabled={busy || pending}
          className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-bright transition disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => setDraft(initial)}
          disabled={busy || pending}
          className="px-4 py-2.5 rounded-xl text-sm text-ink-dim hover:text-ink transition disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ─── Internal building blocks ─────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-glass-border bg-surface p-6 space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-medium text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-ink-dim">{subtitle}</p>}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      {children}
      {hint && <div className="text-[11px] text-ink-faint mt-1">{hint}</div>}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-md bg-input-bg border border-input-border text-ink text-sm focus:outline-none focus:border-accent transition"
    />
  );
}

function LogoUploader({
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
  const inputId = `logo-upload-${variant}`;
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-1">
        {label}
      </label>
      <div className="flex items-center gap-4 p-3 rounded-lg border border-input-border bg-input-bg/50">
        {/* Preview */}
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
                // Reset so re-selecting the same file fires onChange
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
