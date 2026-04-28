'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { GlassPanel } from '@/components/ui';

type Status = 'idle' | 'submitting' | 'success' | 'error';

interface Result {
  company?: { id: string; name: string; slug: string };
  email?: { status: 'sent' | 'failed' | 'skipped'; magicLinkUrl?: string | null; error?: string | null };
  error?: string;
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

export function NewCompanyForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<Result | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [legalName, setLegalName] = useState('');
  const [country, setCountry] = useState('IT');
  const [vatNumber, setVatNumber] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [sdiCode, setSdiCode] = useState('');
  const [pecEmail, setPecEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1a1a1a');
  const [logoExtendedUrl, setLogoExtendedUrl] = useState('');
  const [logoSymbolUrl, setLogoSymbolUrl] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [sendMagicLink, setSendMagicLink] = useState(true);

  // Auto-generate slug from name
  function handleNameChange(v: string) {
    setName(v);
    const auto = v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    if (!slug || slug === auto.slice(0, slug.length)) {
      setSlug(auto);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !ownerEmail.trim()) return;

    setStatus('submitting');
    setResult(null);

    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, slug, legalName, country,
          vatNumber, taxCode, sdiCode, pecEmail,
          address, city, zipCode,
          primaryColor, logoExtendedUrl, logoSymbolUrl,
          ownerEmail, ownerName, sendMagicLink,
        }),
      });

      const data: Result = await res.json();

      if (!res.ok) {
        setStatus('error');
        setResult({ error: data.error || 'Failed to create company' });
        return;
      }

      setStatus('success');
      setResult(data);
    } catch (err) {
      setStatus('error');
      setResult({ error: err instanceof Error ? err.message : 'Network error' });
    }
  }

  if (status === 'success' && result?.company) {
    return (
      <GlassPanel padding="lg">
        <div className="max-w-xl mx-auto text-center py-6">
          <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-3">
            Company created
          </div>
          <h2 className="font-display italic text-3xl text-ink mb-3">
            {result.company.name}
          </h2>
          <p className="text-sm text-ink-dim mb-6">
            Slug: <code className="font-mono text-ink">{result.company.slug}</code>
          </p>

          {result.email?.status === 'sent' && (
            <div className="py-3 px-4 rounded-2xl text-[12px] font-mono border bg-emerald-400/5 border-emerald-400/20 text-emerald-200 mb-4">
              ✓ Magic link sent to <strong>{ownerEmail}</strong>
            </div>
          )}

          {result.email?.status === 'failed' && result.email.magicLinkUrl && (
            <div className="text-left py-3 px-4 rounded-2xl text-[11px] border bg-amber-400/5 border-amber-400/20 text-amber-200 mb-4">
              <div className="font-mono mb-2">⚠ Email failed: {result.email.error}</div>
              <div className="text-ink-dim mb-2">Copy this manual link to send to the owner:</div>
              <code className="block text-[10px] break-all bg-black/30 p-2 rounded-lg select-all text-ink">
                {result.email.magicLinkUrl}
              </code>
            </div>
          )}

          {result.email?.status === 'failed' && !result.email.magicLinkUrl && (
            <div className="py-3 px-4 rounded-2xl text-[11px] font-mono border bg-amber-400/5 border-amber-400/20 text-amber-200 mb-4">
              ⚠ Magic link could not be generated: {result.email.error}
            </div>
          )}

          {result.email?.status === 'skipped' && (
            <div className="py-3 px-4 rounded-2xl text-[11px] font-mono border bg-glass-border bg-white/[0.04] text-ink-dim mb-4">
              Magic link not sent. Owner can request one at /login.
            </div>
          )}

          <div className="flex gap-3 justify-center mt-6">
            <Link
              href={`/admin/companies/${result.company.id}/edit`}
              className="px-5 py-2.5 rounded-2xl border border-glass-border bg-white/[0.04] text-ink text-sm hover:bg-white/[0.08] transition"
            >
              Edit details
            </Link>
            <Link
              href="/admin/companies"
              className="px-5 py-2.5 rounded-2xl bg-accent text-white text-sm hover:bg-accent-bright transition shadow-lg shadow-accent/20"
            >
              Back to companies →
            </Link>
          </div>
        </div>
      </GlassPanel>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      <Section title="Anagrafica" subtitle="Identità della società">
        <Field label="Ragione sociale" required>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            placeholder="Stelvio Collection"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Slug (URL identifier)" hint="auto-generated, editable">
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="stelvio-collection"
              className={`${inputClass} font-mono`}
            />
          </Field>

          <Field label="Country">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={inputClass}
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code} className="bg-ink-bg-2">
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Legal name" hint="optional, official registered name">
          <input
            type="text"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="Stelvio Collection s.r.l."
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Sede" subtitle="Indirizzo legale">
        <Field label="Indirizzo">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Via Roma 1"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="CAP / ZIP">
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="20100"
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label="Città" className="col-span-2">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Milano"
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title="Fatturazione" subtitle="Dati fiscali per fatture e pagamenti">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Partita IVA / VAT" hint="for Italian or EU companies">
            <input
              type="text"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
              placeholder="IT12345678901"
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label="Codice fiscale" hint="optional, IT only">
            <input
              type="text"
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
              placeholder="RSSMRA80A01H501Z"
              className={`${inputClass} font-mono`}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Codice SDI" hint="for Italian e-invoicing">
            <input
              type="text"
              value={sdiCode}
              onChange={(e) => setSdiCode(e.target.value)}
              placeholder="0000000"
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label="PEC email" hint="certified mail (IT)">
            <input
              type="email"
              value={pecEmail}
              onChange={(e) => setPecEmail(e.target.value)}
              placeholder="company@pec.it"
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title="Brand" subtitle="Colori e loghi (opzionali, modificabili dal cliente)">
        <Field label="Primary color" hint="hex code">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-12 h-10 rounded-lg cursor-pointer border border-glass-border bg-transparent"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#1a1a1a"
              className={`${inputClass} font-mono`}
            />
          </div>
        </Field>

        <Field label="Logo extended URL" hint="full wordmark, R2 / CDN URL">
          <input
            type="url"
            value={logoExtendedUrl}
            onChange={(e) => setLogoExtendedUrl(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>

        <Field label="Logo symbol URL" hint="compact icon, R2 / CDN URL">
          <input
            type="url"
            value={logoSymbolUrl}
            onChange={(e) => setLogoSymbolUrl(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="Owner account" subtitle="Il primo Owner della company. Riceverà un magic link per il primo accesso.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner email" required>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
              placeholder="nicholas@stelviocollection.com"
              className={inputClass}
            />
          </Field>
          <Field label="Owner name" hint="optional">
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Nicholas Compagnoni"
              className={inputClass}
            />
          </Field>
        </div>

        <label className="flex items-start gap-3 cursor-pointer mt-2">
          <input
            type="checkbox"
            checked={sendMagicLink}
            onChange={(e) => setSendMagicLink(e.target.checked)}
            className="mt-1 accent-accent"
          />
          <div>
            <div className="text-sm text-ink">Send magic link via email immediately</div>
            <div className="text-[11px] text-ink-faint">
              Owner will receive a styled email with a one-click sign-in link (15 min validity)
            </div>
          </div>
        </label>
      </Section>

      {status === 'error' && result?.error && (
        <div className="py-3 px-4 rounded-2xl text-[12px] font-mono border bg-red-400/5 border-red-400/20 text-red-200">
          ⊘ {result.error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={status === 'submitting' || !name.trim() || !ownerEmail.trim()}
          className="px-7 py-3 rounded-2xl bg-accent text-white text-sm font-medium hover:bg-accent-bright transition-all shadow-lg shadow-accent/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
        >
          {status === 'submitting' ? 'Creating…' : 'Create company →'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-3 rounded-2xl text-ink-dim text-sm hover:text-ink transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputClass =
  'w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-glass-border text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] transition-all';

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
    <GlassPanel padding="lg">
      <div className="mb-4">
        <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-1">
          {title}
        </div>
        {subtitle && (
          <div className="text-[12px] text-ink-dim leading-relaxed">{subtitle}</div>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </GlassPanel>
  );
}

function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
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
