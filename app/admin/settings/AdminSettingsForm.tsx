'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassPanel, Button } from '@/components/ui';

interface AdminSettingsRow {
  bankBeneficiary: string | null;
  bankAddress: string | null;
  bankVat: string | null;
  bankName: string | null;
  bankIban: string | null;
  bankBic: string | null;
  bankNotice: string | null;
  asc_keyId: string | null;
  asc_issuerId: string | null;
  asc_privateKey: string | null;
  asc_appId: string | null;
  asc_vendorId: string | null;
  asc_lastSyncAt: Date | null;
  fb_serviceAccountJson: string | null;
  fb_propertyId: string | null;
  fb_lastSyncAt: Date | null;
  updatedAt: Date;
  updatedByEmail: string | null;
}

interface Props {
  initial: AdminSettingsRow;
}

type Section = 'bank' | 'asc' | 'firebase';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'bank',     label: 'Bank transfer' },
  { id: 'asc',      label: 'App Store Connect' },
  { id: 'firebase', label: 'Firebase' },
];

/**
 * Single form for the AdminSettings singleton. Organised in sections
 * so the page doesn't become a 30-input wall. Each section saves
 * independently — they're orthogonal concerns and saving "bank"
 * shouldn't require fresh asc credentials.
 *
 * Secret fields show a "stored" placeholder when a value exists in
 * DB; leaving them blank on save preserves the existing value, while
 * typing replaces it. We use a `dirty` flag per secret field to tell
 * "user touched this" from "user just clicked save".
 */
export function AdminSettingsForm({ initial }: Props) {
  const router = useRouter();
  const [section, setSection] = useState<Section>('bank');

  // Bank state — plain strings, sent literally on save
  const [bank, setBank] = useState({
    bankBeneficiary: initial.bankBeneficiary ?? '',
    bankAddress:     initial.bankAddress     ?? '',
    bankVat:         initial.bankVat         ?? '',
    bankName:        initial.bankName        ?? '',
    bankIban:        initial.bankIban        ?? '',
    bankBic:         initial.bankBic         ?? '',
    bankNotice:      initial.bankNotice      ?? '',
  });

  // ASC state — secrets show "stored" until user touches them
  const [asc, setAsc] = useState({
    asc_keyId:    initial.asc_keyId    ?? '',
    asc_issuerId: initial.asc_issuerId ?? '',
    asc_appId:    initial.asc_appId    ?? '',
    asc_vendorId: initial.asc_vendorId ?? '',
    asc_privateKey: '',  // never preloaded
  });
  const ascHasPrivateKey = !!initial.asc_privateKey;
  const [ascPrivateKeyDirty, setAscPrivateKeyDirty] = useState(false);

  // Firebase state
  const [fb, setFb] = useState({
    fb_propertyId: initial.fb_propertyId ?? '',
    fb_serviceAccountJson: '',
  });
  const fbHasJson = !!initial.fb_serviceAccountJson;
  const [fbJsonDirty, setFbJsonDirty] = useState(false);

  const [saving, setSaving] = useState<Section | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearStatus() { setSavedAt(null); setError(null); }

  async function saveBank() {
    setSaving('bank'); clearStatus();
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bank),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return; }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch { setError('Network error.'); }
    finally { setSaving(null); }
  }

  async function saveAsc() {
    setSaving('asc'); clearStatus();
    try {
      const payload: Record<string, string | undefined> = {
        asc_keyId:    asc.asc_keyId,
        asc_issuerId: asc.asc_issuerId,
        asc_appId:    asc.asc_appId,
        asc_vendorId: asc.asc_vendorId,
      };
      // Only send the private key if the user actually typed something.
      if (ascPrivateKeyDirty) payload.asc_privateKey = asc.asc_privateKey;
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return; }
      setSavedAt(new Date().toLocaleTimeString());
      setAscPrivateKeyDirty(false);
      setAsc((a) => ({ ...a, asc_privateKey: '' }));
      router.refresh();
    } catch { setError('Network error.'); }
    finally { setSaving(null); }
  }

  async function saveFirebase() {
    setSaving('firebase'); clearStatus();
    try {
      const payload: Record<string, string | undefined> = {
        fb_propertyId: fb.fb_propertyId,
      };
      if (fbJsonDirty) {
        // Validate JSON shape before sending
        try {
          const obj = JSON.parse(fb.fb_serviceAccountJson);
          if (!obj.client_email || !obj.private_key) {
            setError('Service account JSON is missing client_email or private_key.');
            setSaving(null);
            return;
          }
        } catch {
          setError('Service account JSON is not valid JSON.');
          setSaving(null);
          return;
        }
        payload.fb_serviceAccountJson = fb.fb_serviceAccountJson;
      }
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return; }
      setSavedAt(new Date().toLocaleTimeString());
      setFbJsonDirty(false);
      setFb((f) => ({ ...f, fb_serviceAccountJson: '' }));
      router.refresh();
    } catch { setError('Network error.'); }
    finally { setSaving(null); }
  }

  const inputClass = 'w-full px-4 py-2.5 rounded-xl bg-surface-faint border border-glass-border text-ink text-sm focus:outline-none focus:border-accent/50 transition';
  const monoClass  = inputClass + ' font-mono';

  return (
    <div className="max-w-2xl">
      {/* Section tabs */}
      <div role="tablist" className="flex items-center gap-1 p-1 mb-4 rounded-2xl border border-glass-border bg-surface-faint w-fit">
        {SECTIONS.map((s) => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={active}
              onClick={() => { setSection(s.id); clearStatus(); }}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium transition ${
                active ? 'bg-accent text-white shadow-sm' : 'text-ink-dim hover:text-ink hover:bg-surface-hover'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {section === 'bank' && (
        <GlassPanel padding="lg">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-ink mb-1">Bank transfer details</h3>
            <p className="text-xs text-ink-dim leading-relaxed">
              Coordinates shown to customers at checkout and on PDF invoices.
              Empty fields fall back to environment variables.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Beneficiary" value={bank.bankBeneficiary} onChange={(v) => setBank((b) => ({ ...b, bankBeneficiary: v }))} placeholder="Nima Sport Sagl" className={inputClass} />
            <Field label="VAT number"  value={bank.bankVat}         onChange={(v) => setBank((b) => ({ ...b, bankVat: v }))}         placeholder="CHE-416.587.576" className={monoClass} />
            <Field label="Address" value={bank.bankAddress} onChange={(v) => setBank((b) => ({ ...b, bankAddress: v }))} placeholder="Via dal Bagn 4, 7710 Poschiavo, Switzerland" className={inputClass} colSpan={2} />
            <Field label="Bank name" value={bank.bankName} onChange={(v) => setBank((b) => ({ ...b, bankName: v }))} placeholder="Raiffeisen Schweiz" className={inputClass} />
            <Field label="BIC / SWIFT" value={bank.bankBic} onChange={(v) => setBank((b) => ({ ...b, bankBic: v }))} placeholder="RAIFCH22XXX" className={monoClass} />
            <Field label="IBAN" value={bank.bankIban} onChange={(v) => setBank((b) => ({ ...b, bankIban: v }))} placeholder="CH00 0000 0000 0000 0000 0" className={monoClass} colSpan={2} />
          </div>
          <div className="mt-4">
            <label className="block text-[11px] text-ink-dim font-medium mb-1.5">
              Footer notice <span className="text-ink-faint">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Please use the payment reference exactly as written…"
              value={bank.bankNotice}
              onChange={(e) => setBank((b) => ({ ...b, bankNotice: e.target.value }))}
              className={inputClass}
            />
          </div>
          <SaveBar
            saving={saving === 'bank'}
            savedAt={savedAt}
            error={error}
            onSave={saveBank}
            label="Save bank details"
            footer={initial.updatedByEmail ? `Last updated by ${initial.updatedByEmail} on ${new Date(initial.updatedAt).toLocaleDateString()}` : null}
          />
        </GlassPanel>
      )}

      {section === 'asc' && (
        <GlassPanel padding="lg">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-ink mb-1">App Store Connect API</h3>
            <p className="text-xs text-ink-dim leading-relaxed">
              Used to pull daily installs + revenue into the Analytics page.
              Generate a key with the <strong>Sales and Finance</strong> role at{' '}
              <a className="underline" href="https://appstoreconnect.apple.com/access/integrations/api" target="_blank" rel="noopener">
                App Store Connect → Users and Access → Integrations
              </a>.
              {initial.asc_lastSyncAt && (
                <> Last sync: <span className="font-mono">{new Date(initial.asc_lastSyncAt).toLocaleString()}</span>.</>
              )}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Key ID" value={asc.asc_keyId} onChange={(v) => setAsc((a) => ({ ...a, asc_keyId: v }))} placeholder="ABC1234567" className={monoClass} />
            <Field label="Issuer ID" value={asc.asc_issuerId} onChange={(v) => setAsc((a) => ({ ...a, asc_issuerId: v }))} placeholder="12345678-1234-1234-1234-123456789abc" className={monoClass} />
            <Field label="Vendor ID" value={asc.asc_vendorId} onChange={(v) => setAsc((a) => ({ ...a, asc_vendorId: v }))} placeholder="8-9 digit number" className={monoClass} />
            <Field label="App ID (SKU)" value={asc.asc_appId} onChange={(v) => setAsc((a) => ({ ...a, asc_appId: v }))} placeholder="6758993077" className={monoClass} />
          </div>
          <div className="mt-4">
            <label className="block text-[11px] text-ink-dim font-medium mb-1.5">
              P8 private key contents
              {ascHasPrivateKey && !ascPrivateKeyDirty && (
                <span className="ml-2 text-status-success">✓ stored — leave blank to keep</span>
              )}
            </label>
            <textarea
              rows={6}
              placeholder={ascHasPrivateKey ? '••• key stored — paste a new key to replace' : '-----BEGIN PRIVATE KEY-----\nMIG…\n-----END PRIVATE KEY-----'}
              value={asc.asc_privateKey}
              onChange={(e) => { setAsc((a) => ({ ...a, asc_privateKey: e.target.value })); setAscPrivateKeyDirty(true); }}
              className={monoClass}
            />
            <p className="mt-1 text-[10px] text-ink-faint">
              Paste the contents of the .p8 file you downloaded from App Store Connect, including the BEGIN/END lines.
            </p>
          </div>
          <SaveBar
            saving={saving === 'asc'}
            savedAt={savedAt}
            error={error}
            onSave={saveAsc}
            label="Save App Store Connect settings"
          />
        </GlassPanel>
      )}

      {section === 'firebase' && (
        <GlassPanel padding="lg">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-ink mb-1">Firebase Analytics (GA4)</h3>
            <p className="text-xs text-ink-dim leading-relaxed">
              Used to pull DAU, new users, and events into the Analytics page.
              Create a service account in <a className="underline" href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener">Google Cloud → IAM → Service accounts</a>{' '}
              with the <strong>Viewer</strong> role on your GA4 property.
              Paste the downloaded JSON below.
              {initial.fb_lastSyncAt && (
                <> Last sync: <span className="font-mono">{new Date(initial.fb_lastSyncAt).toLocaleString()}</span>.</>
              )}
            </p>
          </div>
          <Field label="GA4 Property ID" value={fb.fb_propertyId} onChange={(v) => setFb((f) => ({ ...f, fb_propertyId: v }))} placeholder="412345678" className={monoClass} colSpan={2} />
          <div className="mt-4">
            <label className="block text-[11px] text-ink-dim font-medium mb-1.5">
              Service account JSON
              {fbHasJson && !fbJsonDirty && (
                <span className="ml-2 text-status-success">✓ stored — leave blank to keep</span>
              )}
            </label>
            <textarea
              rows={10}
              placeholder={fbHasJson ? '••• JSON stored — paste a new file to replace' : '{ "type": "service_account", "project_id": "…", "client_email": "…", "private_key": "-----BEGIN…" }'}
              value={fb.fb_serviceAccountJson}
              onChange={(e) => { setFb((f) => ({ ...f, fb_serviceAccountJson: e.target.value })); setFbJsonDirty(true); }}
              className={monoClass}
            />
          </div>
          <SaveBar
            saving={saving === 'firebase'}
            savedAt={savedAt}
            error={error}
            onSave={saveFirebase}
            label="Save Firebase settings"
          />
        </GlassPanel>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, className, colSpan = 1,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  colSpan?: 1 | 2;
}) {
  return (
    <div className={colSpan === 2 ? 'md:col-span-2' : ''}>
      <label className="block text-[11px] text-ink-dim font-medium mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    </div>
  );
}

function SaveBar({
  saving, savedAt, error, onSave, label, footer,
}: {
  saving: boolean;
  savedAt: string | null;
  error: string | null;
  onSave: () => void;
  label: string;
  footer?: string | null;
}) {
  return (
    <div className="mt-6 pt-4 border-t border-glass-border flex items-center gap-3 flex-wrap">
      <Button onClick={onSave} disabled={saving} variant="primary">
        {saving ? 'Saving…' : label}
      </Button>
      {savedAt && <span className="text-xs text-status-success">Saved at {savedAt}</span>}
      {error && <span className="text-xs text-status-danger">{error}</span>}
      {footer && !savedAt && !error && (
        <span className="text-[11px] text-ink-faint font-mono">{footer}</span>
      )}
    </div>
  );
}
