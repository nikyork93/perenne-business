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
  updatedAt: Date;
  updatedByEmail: string | null;
}

interface Props {
  initial: AdminSettingsRow;
}

/**
 * Single-form editor for the AdminSettings singleton row. The form is
 * organised in a "Bank transfer details" section because that's all
 * we store today; future settings will get their own sections below.
 *
 * Empty inputs are sent as empty strings; the API translates those
 * to NULL in the DB so lib/bank.ts:getBankDetails falls back to env
 * vars / defaults for blanks.
 */
export function AdminSettingsForm({ initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    bankBeneficiary: initial.bankBeneficiary ?? '',
    bankAddress:     initial.bankAddress     ?? '',
    bankVat:         initial.bankVat         ?? '',
    bankName:        initial.bankName        ?? '',
    bankIban:        initial.bankIban        ?? '',
    bankBic:         initial.bankBic         ?? '',
    bankNotice:      initial.bankNotice      ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to save');
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full px-4 py-2.5 rounded-xl bg-surface-faint border border-glass-border text-ink text-sm focus:outline-none focus:border-accent/50 transition';
  const monoClass  = inputClass + ' font-mono';

  return (
    <div className="max-w-2xl space-y-4">
      <GlassPanel padding="lg">
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-ink mb-1">Bank transfer details</h3>
          <p className="text-xs text-ink-dim leading-relaxed">
            These coordinates appear in the order confirmation popup and on the
            generated PDF invoices. Customers click each field to copy it.
            Empty fields fall back to environment variables and then to a
            placeholder.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Beneficiary"          value={form.bankBeneficiary} onChange={(v) => update('bankBeneficiary', v)} placeholder="Nima Sport Sagl" className={inputClass} />
          <Field label="VAT number"           value={form.bankVat}         onChange={(v) => update('bankVat', v)}         placeholder="CHE-416.587.576" className={monoClass} />
          <Field
            label="Beneficiary address"
            value={form.bankAddress}
            onChange={(v) => update('bankAddress', v)}
            placeholder="Via dal Bagn 4, 7710 Poschiavo, Switzerland"
            className={inputClass}
            colSpan={2}
          />
          <Field label="Bank name"            value={form.bankName}        onChange={(v) => update('bankName', v)}        placeholder="Raiffeisen Schweiz" className={inputClass} />
          <Field label="BIC / SWIFT"          value={form.bankBic}         onChange={(v) => update('bankBic', v)}         placeholder="RAIFCH22XXX" className={monoClass} />
          <Field
            label="IBAN"
            value={form.bankIban}
            onChange={(v) => update('bankIban', v)}
            placeholder="CH00 0000 0000 0000 0000 0"
            className={monoClass}
            colSpan={2}
          />
        </div>

        <div className="mt-4">
          <label className="block text-[11px] text-ink-dim font-medium mb-1.5">
            Footer notice <span className="text-ink-faint">(optional)</span>
          </label>
          <textarea
            rows={3}
            placeholder="Please use the payment reference exactly as written…"
            value={form.bankNotice}
            onChange={(e) => update('bankNotice', e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-[10px] text-ink-faint">
            Shown as a small note under the bank coordinates in the checkout popup.
          </p>
        </div>

        <div className="mt-6 pt-4 border-t border-glass-border flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving} variant="primary">
            {saving ? 'Saving…' : 'Save bank details'}
          </Button>
          {savedAt && (
            <span className="text-xs text-status-success">Saved at {savedAt}</span>
          )}
          {error && (
            <span className="text-xs text-status-danger">{error}</span>
          )}
          {!savedAt && !error && initial.updatedByEmail && (
            <span className="text-[11px] text-ink-faint font-mono">
              Last updated by {initial.updatedByEmail} on{' '}
              {new Date(initial.updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </GlassPanel>
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
      <label className="block text-[11px] text-ink-dim font-medium mb-1.5">
        {label}
      </label>
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
