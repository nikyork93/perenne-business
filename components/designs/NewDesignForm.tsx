'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GlassPanel, Button, Input, Select, Whisper } from '@/components/ui';
import type { DesignSummary } from '@/types/design';

interface Props {
  existingDesigns: DesignSummary[];
}

export function NewDesignForm({ existingDesigns }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [copyFromId, setCopyFromId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same defensive parser as elsewhere — surface real server errors.
  async function parseResponse(res: Response, label: string) {
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      const text = await res.text().catch(() => '');
      console.error(`[${label}] non-JSON response`, {
        status: res.status,
        bodyPreview: text.slice(0, 300),
      });
      return { ok: false, error: `Server returned ${res.status} ${res.statusText}.` };
    }
    try {
      const data = await res.json();
      return { ok: res.ok, data };
    } catch {
      return { ok: false, error: 'Server returned invalid JSON.' };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          copyFromDesignId: copyFromId || undefined,
        }),
      });
      const parsed = await parseResponse(res, 'create-design');
      if (!parsed.ok) {
        setError(parsed.error ?? parsed.data?.error ?? 'Could not create design.');
        setSubmitting(false);
        return;
      }
      const id = parsed.data?.design?.id;
      if (!id) {
        setError('Server did not return new design id.');
        setSubmitting(false);
        return;
      }
      // Land directly in the editor for the new design.
      router.push(`/designs/${id}/edit`);
    } catch (err) {
      console.error('[create-design] fetch failed', err);
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <GlassPanel padding="lg" animate>
        <div className="space-y-5">
          <Input
            label="Design name"
            placeholder="Christmas 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoFocus
            error={error && !name.trim() ? error : undefined}
          />

          <Select
            label="Copy from existing"
            hint="optional"
            value={copyFromId}
            onChange={(e) => setCopyFromId(e.target.value)}
          >
            <option value="">— Start from blank —</option>
            {existingDesigns.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.isDefault ? ' · default' : ''}
              </option>
            ))}
          </Select>

          {existingDesigns.length === 0 && (
            <Whisper>
              You don&apos;t have any existing designs to copy from yet — no worries, you&apos;ll start blank.
            </Whisper>
          )}

          {error && name.trim() && (
            <div className="py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-danger/5 border-danger/20 text-[#ff9a9a]">
              ✕ {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="primary" loading={submitting}>
              Create design
            </Button>
            <Link href="/designs">
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
          </div>
        </div>
      </GlassPanel>
    </form>
  );
}
