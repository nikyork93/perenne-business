'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GlassPanel, Button, Input, Whisper } from '@/components/ui';

function LoginForm() {
  const params = useSearchParams();
  const errorParam = params.get('error');

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(errorParam);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/request-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
      } else {
        setSent(true);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <>
        <div className="label mb-2 text-accent">Link sent</div>
        <h1 className="font-display italic text-4xl tracking-tight mb-4">
          Check your inbox
        </h1>
        <p className="text-sm text-ink-dim leading-relaxed mb-2">
          We sent a sign-in link to <span className="text-ink font-mono text-xs">{email}</span>.
        </p>
        <p className="text-sm text-ink-dim leading-relaxed">
          Click it to continue. The link expires in 15 minutes and can only be used once.
        </p>
        <div className="mt-6 pt-5 border-t border-glass-border">
          <button
            type="button"
            onClick={() => { setSent(false); setEmail(''); }}
            className="text-xs text-ink-faint hover:text-ink transition-colors"
          >
            Use a different email →
          </button>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="label mb-2">Sign in</div>
      <h1 className="font-display italic text-4xl tracking-tight mb-4">
        Welcome back
      </h1>
      <p className="text-sm text-ink-dim leading-relaxed mb-6">
        Enter your email and we&apos;ll send a sign-in link.
        No passwords, ever.
      </p>

      <Input
        type="email"
        label="Email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoFocus
        autoComplete="email"
        disabled={loading}
        error={error ?? undefined}
      />

      <div className="mt-5">
        <Button type="submit" variant="primary" block loading={loading} disabled={!email || loading}>
          Send sign-in link
        </Button>
      </div>

      <div className="mt-8 pt-5 border-t border-glass-border">
        <Whisper>
          First time here? Just enter your email — an account will be created.
        </Whisper>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <GlassPanel animate padding="lg" className="max-w-md w-full">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </GlassPanel>
    </main>
  );
}
