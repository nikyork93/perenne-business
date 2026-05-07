'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GlassPanel, Button, Input } from '@/components/ui';

interface CompanyOpt {
  id: string;
  name: string;
  slug: string;
}

interface DesignOpt {
  id: string;
  name: string;
  companyId: string;
  isArchived: boolean;
}

interface NewBatchFormProps {
  companies: CompanyOpt[];
  designs: DesignOpt[];
}

export function NewBatchForm({ companies, designs }: NewBatchFormProps) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState('');
  const [designId, setDesignId] = useState('');
  const [count, setCount] = useState(50);
  const [batchLabel, setBatchLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyDesigns = useMemo(
    () => designs.filter((d) => d.companyId === companyId),
    [designs, companyId]
  );

  // Reset designId when company changes
  function handleCompanyChange(id: string) {
    setCompanyId(id);
    setDesignId('');
    if (!batchLabel) {
      const c = companies.find((x) => x.id === id);
      if (c) {
        const d = new Date();
        const month = d.toLocaleString('en', { month: 'short' });
        setBatchLabel(`${c.name} ${month} ${d.getFullYear()}`);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!companyId) {
      setError('Select a company.');
      return;
    }
    if (!batchLabel.trim()) {
      setError('Batch label is required.');
      return;
    }
    if (count < 1 || count > 500) {
      setError('Count must be between 1 and 500.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/codes/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companyId,
          designId: designId || null,
          count,
          batchLabel: batchLabel.trim(),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create batch');
        return;
      }
      router.push('/admin/codes');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded border border-danger/30 bg-danger/10 text-danger text-sm">
          {error}
        </div>
      )}

      <GlassPanel className="p-6 space-y-4">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-2">
            Company *
          </label>
          <select
            value={companyId}
            onChange={(e) => handleCompanyChange(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-input-bg border border-input-border text-ink"
          >
            <option value="">— select —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-2">
            Design (optional)
          </label>
          <select
            value={designId}
            onChange={(e) => setDesignId(e.target.value)}
            disabled={!companyId}
            className="w-full px-3 py-2 rounded-md bg-input-bg border border-input-border text-ink disabled:opacity-50"
          >
            <option value="">— none (codes carry company default) —</option>
            {companyDesigns.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {companyId && companyDesigns.length === 0 && (
            <div className="text-xs text-ink-faint mt-1">
              This company has no designs yet.
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-2">
              Number of codes *
            </label>
            <Input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value || '0', 10))}
            />
            <div className="text-xs text-ink-faint mt-1">Max 500 per batch.</div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-2">
              Batch label *
            </label>
            <Input
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
              placeholder="e.g. Stelvio Q1 2026"
              maxLength={120}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono mb-2">
            Internal notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Free batch for partner trade show"
            maxLength={500}
            rows={2}
            className="w-full px-3 py-2 rounded-md bg-input-bg border border-input-border text-ink text-sm"
          />
        </div>
      </GlassPanel>

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          type="button"
          onClick={() => router.back()}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : `Create ${count} codes`}
        </Button>
      </div>
    </form>
  );
}
