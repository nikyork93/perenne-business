'use client';

import { useState, type FormEvent } from 'react';
import { GlassPanel, Button, Input, Whisper } from '@/components/ui';
import { PerenneLogo } from '@/components/layout/PerenneLogo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('sending');
    setMessage('');

    try {
      const res = await fetch('/api/auth/request-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send login link');
      }

      setStatus('sent');
      setMessage(data.message || 'Check your email for a sign-in link.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-ink-bg">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex justify-center text-ink">
          <PerenneLogo variant="extended" height={36} />
        </div>

        <GlassPanel padding="lg" animate>
          <div className="mb-6 text-center">
            <div className="label mb-2 text-ink-faint">Business portal</div>
            <h1 className="font-display italic text-2xl tracking-tight">
              Sign in
            </h1>
            <p className="mt-2 text-xs text-ink-dim leading-relaxed">
              Enter your work email and we&apos;ll send you a one-click sign-in link.
            </p>
          </div>

          {status === 'sent' ? (
            <div className="space-y-4">
              <div className="py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-emerald-400/5 border-emerald-400/20 text-emerald-200">
                ✓ {message}
              </div>
              <Whisper>
                The link expires in 15 minutes. You can close this tab.
              </Whisper>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={status === 'sending'}
              />

              {status === 'error' && (
                <div className="py-2 px-3 rounded-lg text-[11px] font-mono border bg-red-400/5 border-red-400/20 text-red-200">
                  ⊘ {message}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                block
                disabled={status === 'sending' || !email.trim()}
              >
                {status === 'sending' ? 'Sending…' : 'Send sign-in link →'}
              </Button>
            </form>
          )}
        </GlassPanel>

        <p className="text-center text-[10px] text-ink-faint font-mono">
          New here? Your account is created automatically on first sign-in.
        </p>
      </div>
    </main>
  );
}
