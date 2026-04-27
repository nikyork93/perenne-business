import Link from 'next/link';
import { GlassPanel, Button } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <GlassPanel animate padding="lg" className="max-w-md w-full text-center">
        <div className="label mb-2 text-accent">404</div>
        <h1 className="font-display italic text-4xl tracking-tight mb-3">
          Page not found
        </h1>
        <p className="text-sm text-ink-dim leading-relaxed mb-8">
          The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Link href="/dashboard">
          <Button variant="primary" block>← Back to dashboard</Button>
        </Link>
      </GlassPanel>
    </main>
  );
}
