'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PerenneLogo } from '@/components/layout/PerenneLogo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Sign in failed');
        setSubmitting(false);
        return;
      }

      router.push(data.destination || '/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <main
      data-theme="dark"
      className="min-h-screen flex items-center justify-center p-6 text-ink relative overflow-hidden"
      style={{
        // Force dark text/ink palette here regardless of the user's
        // selected theme, because the background is hardcoded dark.
        // Otherwise a user in light mode lands on a dark gradient with
        // dark-grey ink and can't see logos or labels.
        '--text': 'rgba(244, 244, 245, 0.96)',
        '--text-dim': 'rgba(193, 193, 200, 0.85)',
        '--text-faint': 'rgba(113, 113, 122, 0.85)',
        '--glass-border': 'rgba(255, 255, 255, 0.09)',
        background: `
          radial-gradient(ellipse 80% 60% at 20% 20%, rgba(74,122,140,0.30) 0%, transparent 55%),
          radial-gradient(ellipse 70% 50% at 80% 80%, rgba(44,88,104,0.22) 0%, transparent 55%),
          radial-gradient(ellipse 50% 40% at 50% 50%, rgba(90,146,168,0.10) 0%, transparent 60%),
          linear-gradient(180deg, #0a0a0f 0%, #0f0f15 100%)
        `,
      } as React.CSSProperties}
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
          <div className="mb-6 text-center">
            <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">
              Business portal
            </div>
            <h1 className="font-display italic text-2xl tracking-tight text-ink">
              Sign in
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] text-ink-dim font-medium mb-1.5">Email</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={submitting}
                className={inputClass}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-ink-dim font-medium">Password</label>
                <Link
                  href="/forgot-password"
                  className="text-[10px] text-ink-faint hover:text-accent-bright transition font-mono"
                >
                  forgot?
                </Link>
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={submitting}
                className={inputClass}
              />
            </div>

            {error && (
              <div className="py-2.5 px-4 rounded-2xl text-[11px] font-mono border bg-red-400/5 border-red-400/20 text-red-200 text-center">
                ⊘ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              className="w-full px-5 py-3 rounded-2xl bg-accent text-white text-sm font-medium tracking-wide hover:bg-accent-bright transition-all duration-200 shadow-lg shadow-accent/20 hover:shadow-accent/30 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
            >
              {submitting ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[10px] text-ink-faint font-mono tracking-widest uppercase">
          Access by invitation only
        </p>
      </div>
    </main>
  );
}

const inputClass =
  'w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-glass-border text-ink text-sm font-sans placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] transition-all disabled:opacity-50';
