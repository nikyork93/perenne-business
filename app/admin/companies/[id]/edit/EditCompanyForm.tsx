'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { GlassPanel } from '@/components/ui';

type Status = 'idle' | 'saving' | 'saved' | 'error' | 'deleting';

interface CompanyData {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  address: string | null;
  city: string | null;
  zipCode: string | null;
  country: string | null;
  sdiCode: string | null;
  pecEmail: string | null;
  primaryColor: string | null;
  logoExtendedUrl: string | null;
  logoSymbolUrl: string | null;
}

const COUNTRY_OPTIONS = [
  { code: 'IT', name: 'Italy' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'AT', name: 'Austria' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
];

export function EditCompanyForm({ company }: { company: CompanyData }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(company.name);
  const [slug, setSlug] = useState(company.slug);
  const [legalName, setLegalName] = useState(company.legalName ?? '');
  const [country, setCountry] = useState(company.country ?? 'IT');
  const [vatNumber, setVatNumber] = useState(company.vatNumber ?? '');
  const [taxCode, setTaxCode] = useState(company.taxCode ?? '');
  const [sdiCode, setSdiCode] = useState(company.sdiCode ?? '');
  const [pecEmail, setPecEmail] = useState(company.pecEmail ?? '');
  const [address, setAddress] = useState(company.address ?? '');
  const [city, setCity] = useState(company.city ?? '');
  const [zipCode, setZipCode] = useState(company.zipCode ?? '');
  const [primaryColor, setPrimaryColor] = useState(company.primaryColor ?? '#1a1a1a');
  const [logoExtendedUrl, setLogoExtendedUrl] = useState(company.logoExtendedUrl ?? '');
  const [logoSymbolUrl, setLogoSymbolUrl] = useState(company.logoSymbolUrl ?? '');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError(null);

    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, slug, legalName, country,
          vatNumber, taxCode, sdiCode, pecEmail,
          address, city, zipCode,
          primaryColor, logoExtendedUrl, logoSymbolUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setError(data.error || 'Failed to save');
        return;
      }

      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
      router.refresh();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  async function handleDelete() {
    if (!confirm(`Permanently delete "${company.name}"?\n\nThis will cascade delete: users, codes, orders, audit logs.\nThis cannot be undone.`)) return;
    if (!confirm(`Last warning. Type-confirm by clicking OK if you really want to delete ${company.name}.`)) return;

    setStatus('deleting');
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setStatus('error');
        setError(data.error || 'Failed to delete');
        return;
      }
      router.push('/admin/companies');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      <Section title="Anagrafica">
        <Field label="Ragione sociale" required>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slug" hint="must be unique">
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Country">
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass}>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code} className="bg-ink-bg-2">{c.code} — {c.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Legal name">
          <input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} className={inputClass} />
        </Field>
      </Section>

      <Section title="Sede">
        <Field label="Indirizzo">
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="CAP / ZIP">
            <input type="text" value={zipCode} onChange={(e) => setZipCode(e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Città" className="col-span-2">
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="Fatturazione">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Partita IVA / VAT">
            <input type="text" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Codice fiscale">
            <input type="text" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Codice SDI">
            <input type="text" value={sdiCode} onChange={(e) => setSdiCode(e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="PEC email">
            <input type="email" value={pecEmail} onChange={(e) => setPecEmail(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="Brand">
        <Field label="Primary color">
          <div className="flex items-center gap-3">
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-12 h-10 rounded-lg cursor-pointer border border-glass-border bg-transparent" />
            <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
              className={`${inputClass} font-mono`} />
          </div>
        </Field>
        <Field label="Logo extended URL">
          <input type="url" value={logoExtendedUrl} onChange={(e) => setLogoExtendedUrl(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Logo symbol URL">
          <input type="url" value={logoSymbolUrl} onChange={(e) => setLogoSymbolUrl(e.target.value)} className={inputClass} />
        </Field>
      </Section>

      {status === 'error' && error && (
        <div className="py-3 px-4 rounded-2xl text-[12px] font-mono border bg-red-400/5 border-red-400/20 text-red-200">
          ⊘ {error}
        </div>
      )}
      {status === 'saved' && (
        <div className="py-3 px-4 rounded-2xl text-[12px] font-mono border bg-status-success border-status-success text-status-success">
          ✓ Saved
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button type="submit" disabled={status === 'saving'}
            className="px-7 py-3 rounded-2xl bg-accent text-white text-sm font-medium hover:bg-accent-bright transition-all shadow-lg shadow-accent/20 hover:-translate-y-0.5 disabled:opacity-50">
            {status === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={() => router.push('/admin/companies')}
            className="px-5 py-3 rounded-2xl text-ink-dim text-sm hover:text-ink transition">
            Back
          </button>
        </div>

        <button type="button" onClick={handleDelete} disabled={status === 'deleting'}
          className="px-4 py-2 rounded-xl text-[11px] border border-red-400/20 bg-red-400/5 text-red-300 hover:bg-red-400/10 transition disabled:opacity-50 font-mono">
          {status === 'deleting' ? 'Deleting…' : 'Delete company'}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  'w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-glass-border text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] transition-all';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassPanel padding="lg">
      <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-4">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </GlassPanel>
  );
}

function Field({
  label, required, hint, className, children,
}: {
  label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[11px] text-ink-dim font-medium">
          {label}
          {required && <span className="text-accent-bright ml-0.5">*</span>}
        </label>
        {hint && <span className="text-[10px] text-ink-faint font-mono">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
