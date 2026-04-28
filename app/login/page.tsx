'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
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
    <main className="min-h-screen flex items-center justify-center p-6 bg-ink-bg relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 20% 30%, rgba(74,122,140,0.25) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(44,88,104,0.20) 0%, transparent 50%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        <Link href="/" className="block mb-10 text-ink">
          <div className="flex justify-center">
            <PerenneLogo variant="extended" height={32} />
          </div>
        </Link>

        <div className="rounded-3xl border border-glass-border bg-glass-base backdrop-blur-2xl backdrop-saturate-180 p-8 shadow-glass-lg">
          <div className="mb-6 text-center">
            <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">
              Business portal
            </div>
            <h1 className="font-display italic text-2xl tracking-tight text-ink">
              Sign in
            </h1>
            <p className="mt-2 text-xs text-ink-dim leading-relaxed">
              Enter your work email and we&apos;ll send you a one-click sign-in link.
            </p>
          </div>

          {status === 'sent' ? (
            <div className="space-y-4">
              <div className="py-3 px-4 rounded-2xl text-[11px] font-mono border bg-emerald-400/5 border-emerald-400/20 text-emerald-200 text-center">
                ✓ {message}
              </div>
              <p className="text-[11px] text-ink-faint text-center leading-relaxed font-sans">
                The link expires in 15 minutes. You can close this tab.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={status === 'sending'}
                className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-glass-border text-ink text-sm font-sans placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] transition-all disabled:opacity-50"
              />

              {status === 'error' && (
                <div className="py-2.5 px-4 rounded-2xl text-[11px] font-mono border bg-red-400/5 border-red-400/20 text-red-200 text-center">
                  ⊘ {message}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'sending' || !email.trim()}
                className="w-full px-5 py-3 rounded-2xl bg-accent text-white text-sm font-medium tracking-wide hover:bg-accent-bright transition-all duration-200 shadow-accent-glow hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
              >
                {status === 'sending' ? 'Sending…' : 'Send sign-in link →'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[10px] text-ink-faint font-mono tracking-widest uppercase">
          Account auto-created on first sign-in
        </p>
      </div>
    </main>
  );
}
