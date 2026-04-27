'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select } from '@/components/ui';
import { COUNTRIES } from '@/lib/countries';

export function OnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    country: 'IT',
    legalName: '',
    vatNumber: '',
    address: '',
    city: '',
    zipCode: '',
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create company.');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Input
        label="Company name"
        placeholder="Acme Corp"
        value={form.name}
        onChange={(e) => update('name', e.target.value)}
        required
        autoFocus
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Country"
          value={form.country}
          onChange={(e) => update('country', e.target.value)}
          required
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>

        <Input
          label="VAT Number"
          hint="optional"
          placeholder="IT12345678901"
          value={form.vatNumber}
          onChange={(e) => update('vatNumber', e.target.value)}
          mono
        />
      </div>

      <Input
        label="Legal name"
        hint="if different from display name"
        placeholder="Acme Corporation S.p.A."
        value={form.legalName}
        onChange={(e) => update('legalName', e.target.value)}
      />

      <Input
        label="Address"
        hint="optional"
        placeholder="Via del Corso 123"
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

      {error && (
        <div className="text-[11px] text-danger font-mono py-2 px-3 bg-danger/5 border border-danger/20 rounded-lg">
          {error}
        </div>
      )}

      <Button type="submit" variant="primary" block loading={loading} disabled={!form.name || loading}>
        Create company →
      </Button>
    </form>
  );
}
