'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { GlassPanel, Button } from '@/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console in dev; in production this would go to Sentry/Logflare
    console.error('App error:', error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <GlassPanel animate padding="lg" className="max-w-md w-full text-center">
        <div className="label mb-2 text-danger">Error</div>
        <h1 className="font-display italic text-4xl tracking-tight mb-3">
          Something went wrong
        </h1>
        <p className="text-sm text-ink-dim leading-relaxed mb-2">
          We hit an unexpected error. Try again, or contact us if it persists.
        </p>
        {error.digest && (
          <p className="text-[10px] text-ink-faint font-mono mb-8">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <Button variant="primary" onClick={reset}>Try again</Button>
          <Link href="/dashboard">
            <Button variant="default">← Dashboard</Button>
          </Link>
        </div>
        <p className="mt-8 text-[11px] text-ink-faint">
          Need help? <a href="mailto:business@perenne.app" className="underline">business@perenne.app</a>
        </p>
      </GlassPanel>
    </main>
  );
}
