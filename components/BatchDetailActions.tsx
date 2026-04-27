'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassPanel, Button } from '@/components/ui';

export function BatchDetailActions({
  batchId,
  failedCount,
}: {
  batchId: string;
  failedCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  async function handleResend() {
    if (!confirm(`Retry sending to ${failedCount} failed recipients?`)) return;
    setLoading(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/distribution/${batchId}/resend-failed`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setFlash(`Error: ${data.error ?? 'Retry failed'}`);
        return;
      }
      setFlash(`Retry complete: ${data.sent} sent, ${data.failed} still failed.`);
      router.refresh();
    } catch {
      setFlash('Network error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassPanel padding="md" className="flex items-center justify-between">
      <div>
        <div className="text-sm text-ink-dim mb-0.5">
          {failedCount} email{failedCount !== 1 ? 's' : ''} failed to send
        </div>
        {flash && (
          <div className="text-[11px] text-emerald-300 font-mono mt-1">{flash}</div>
        )}
      </div>
      <Button variant="primary" onClick={handleResend} loading={loading}>
        ↻ Retry failed
      </Button>
    </GlassPanel>
  );
}
