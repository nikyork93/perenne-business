'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select } from '@/components/ui';
import { COUNTRIES } from '@/lib/countries';

interface SettingsFormProps {
  company: {
    id: string;
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
    primaryColor: string | null;
  };
  /** If false, fiscal fields are read-only */
  canEditFiscal: boolean;
}

export function SettingsForm({ company, canEditFiscal }: SettingsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name:      company.name,
    legalName: company.legalName ?? '',
    vatNumber: company.vatNumber ?? '',
    taxCode:   company.taxCode ?? '',
    address:   company.address ?? '',
    city:      company.city ?? '',
    zipCode:   company.zipCode ?? '',
    country:   company.country ?? 'IT',
    sdiCode:   company.sdiCode ?? '',
    pecEmail:  company.pecEmail ?? '',
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    // Only include fiscal fields if user is allowed
    const payload: Record<string, string | null> = {
      name:    form.name,
      country: form.country,
      address: form.address,
      city:    form.city,
      zipCode: form.zipCode,
    };

    if (canEditFiscal) {
      payload.legalName = form.legalName;
      payload.vatNumber = form.vatNumber;
      payload.taxCode   = form.taxCode;
      payload.sdiCode   = form.sdiCode;
      payload.pecEmail  = form.pecEmail;
    }

    try {
      const res = await fetch(`/api/company/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save.');
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* General */}
      <div>
        <div className="label mb-3">General</div>
        <div className="space-y-4">
          <Input
            label="Company name"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            required
          />
          <Select
            label="Country"
            value={form.country}
            onChange={(e) => update('country', e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Address */}
      <div>
        <div className="label mb-3">Address</div>
        <div className="space-y-4">
          <Input
            label="Street address"
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="City"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
            />
            <Input
              label="ZIP code"
              value={form.zipCode}
              onChange={(e) => update('zipCode', e.target.value)}
              mono
            />
          </div>
        </div>
      </div>

      {/* Fiscal */}
      <div>
        <div className="label mb-3 flex items-center justify-between">
          <span>Fiscal information</span>
          {!canEditFiscal && (
            <span className="text-[10px] text-ink-faint normal-case tracking-normal">
              Owner-only
            </span>
          )}
        </div>
        <div className="space-y-4">
          <Input
            label="Legal name"
            value={form.legalName}
            onChange={(e) => update('legalName', e.target.value)}
            disabled={!canEditFiscal}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="VAT number"
              value={form.vatNumber}
              onChange={(e) => update('vatNumber', e.target.value)}
              disabled={!canEditFiscal}
              mono
            />
            <Input
              label="Tax code"
              hint="IT codice fiscale"
              value={form.taxCode}
              onChange={(e) => update('taxCode', e.target.value)}
              disabled={!canEditFiscal}
              mono
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="SDI code"
              hint="IT e-invoicing"
              value={form.sdiCode}
              onChange={(e) => update('sdiCode', e.target.value)}
              disabled={!canEditFiscal}
              mono
            />
            <Input
              label="PEC email"
              type="email"
              value={form.pecEmail}
              onChange={(e) => update('pecEmail', e.target.value)}
              disabled={!canEditFiscal}
            />
          </div>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="text-[11px] text-danger font-mono py-2 px-3 bg-danger/5 border border-danger/20 rounded-lg">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="text-[11px] text-status-success font-mono py-2 px-3 bg-status-success border border-status-success rounded-lg">
          ✓ Changes saved
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-glass-border">
        <Button type="submit" variant="primary" loading={loading}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
