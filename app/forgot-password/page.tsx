'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { PerenneLogo } from '@/components/layout/PerenneLogo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch {
      // Always show success — security: no email enumeration
      setSent(true);
    }
    setSubmitting(false);
  }

  return (
    <main
      data-theme="dark"
      className="min-h-screen flex items-center justify-center p-6 text-ink relative overflow-hidden"
      style={{
        '--text': 'rgba(244, 244, 245, 0.96)',
        '--text-dim': 'rgba(193, 193, 200, 0.85)',
        '--text-faint': 'rgba(113, 113, 122, 0.85)',
        '--glass-border': 'rgba(255, 255, 255, 0.09)',
        background: `
          radial-gradient(ellipse 80% 60% at 20% 20%, rgba(74,122,140,0.30) 0%, transparent 55%),
          radial-gradient(ellipse 70% 50% at 80% 80%, rgba(44,88,104,0.22) 0%, transparent 55%),
          linear-gradient(180deg, #0a0a0f 0%, #0f0f15 100%)
        `,
      }}
    >
      <div className="relative w-full max-w-sm">
        <Link href="/" className="block mb-10 text-ink">
          <div className="flex justify-center">
            <PerenneLogo variant="extended" height={32} />
          </div>
        </Link>

        <div
          className="rounded-3xl p-8 shadow-glass-lg"
          style={{
            background: 'rgba(20, 20, 25, 0.55)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {sent ? (
            <div className="text-center py-4">
              <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">
                Check your inbox
              </div>
              <h1 className="font-display italic text-2xl tracking-tight text-ink mb-3">
                Reset link sent
              </h1>
              <p className="text-sm text-ink-dim mb-6 leading-relaxed">
                If an account exists for <span className="font-mono text-ink">{email}</span>, you&apos;ll receive an email with a link to reset your password. Link expires in 1 hour.
              </p>
              <Link
                href="/login"
                className="inline-block text-[12px] text-ink-faint hover:text-ink transition font-mono"
              >
                ← back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 text-center">
                <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">
                  Recovery
                </div>
                <h1 className="font-display italic text-2xl tracking-tight text-ink">
                  Forgot password
                </h1>
                <p className="text-xs text-ink-dim mt-2 leading-relaxed">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  disabled={submitting}
                  className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-glass-border text-ink text-sm font-sans placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] transition-all disabled:opacity-50"
                />

                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="w-full px-5 py-3 rounded-2xl bg-accent text-white text-sm font-medium tracking-wide hover:bg-accent-bright transition-all duration-200 shadow-lg shadow-accent/20 hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {submitting ? 'Sending…' : 'Send reset link →'}
                </button>

                <Link
                  href="/login"
                  className="block text-center text-[11px] text-ink-faint hover:text-ink transition font-mono pt-2"
                >
                  ← back to sign in
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
