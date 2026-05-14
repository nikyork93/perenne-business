'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PerenneLogo } from '@/components/layout/PerenneLogo';
import { PasswordField } from '@/components/ui/PasswordField';
import { evaluatePassword } from '@/lib/password';

function ResetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loadingState, setLoadingState] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [validationError, setValidationError] = useState('');
  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadingState('invalid');
      setValidationError('No reset token provided');
      return;
    }

    fetch(`/api/auth/reset-password?token=${token}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (ok && data.valid) {
          setEmail(data.email);
          setLoadingState('valid');
        } else {
          setLoadingState('invalid');
          setValidationError(data.error || 'Invalid or expired token');
        }
      })
      .catch(() => {
        setLoadingState('invalid');
        setValidationError('Could not validate token');
      });
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError('');

    const validation = evaluatePassword(password, email);
    if (!validation.isValid) {
      setSubmitError(validation.errors[0]);
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || 'Could not reset password');
        setSubmitting(false);
        return;
      }

      setDone(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
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
          {loadingState === 'loading' && (
            <div className="text-center py-8">
              <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">Verifying</div>
              <div className="text-sm text-ink-dim">Please wait…</div>
            </div>
          )}

          {loadingState === 'invalid' && (
            <div className="text-center py-4">
              <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">Link invalid</div>
              <h1 className="font-display italic text-2xl tracking-tight text-ink mb-3">Reset link expired</h1>
              <p className="text-sm text-ink-dim mb-6">{validationError}</p>
              <Link href="/forgot-password" className="inline-block px-5 py-2.5 rounded-2xl bg-accent text-white text-sm hover:bg-accent-bright transition shadow-lg shadow-accent/20">
                Request a new link →
              </Link>
            </div>
          )}

          {loadingState === 'valid' && !done && (
            <>
              <div className="mb-6 text-center">
                <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">New password</div>
                <h1 className="font-display italic text-2xl tracking-tight text-ink">Reset password</h1>
                <p className="text-xs text-ink-dim mt-2 leading-relaxed">
                  Setting a new password for <span className="font-mono text-ink">{email}</span>
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  email={email}
                  label="New password"
                  showMeter={true}
                  showSuggest={true}
                  autoFocus
                  required
                  disabled={submitting}
                />

                <PasswordField
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  email={email}
                  label="Confirm password"
                  showMeter={false}
                  showSuggest={false}
                  required
                  disabled={submitting}
                />

                {submitError && (
                  <div className="py-2.5 px-4 rounded-2xl text-[11px] font-mono border bg-red-400/5 border-red-400/20 text-red-200 text-center">
                    ⊘ {submitError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !password || !confirmPassword}
                  className="w-full px-5 py-3 rounded-2xl bg-accent text-white text-sm font-medium tracking-wide hover:bg-accent-bright transition-all duration-200 shadow-lg shadow-accent/20 hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Update password →'}
                </button>
              </form>
            </>
          )}

          {done && (
            <div className="text-center py-4">
              <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">Password updated</div>
              <h1 className="font-display italic text-2xl tracking-tight text-ink mb-3">You&apos;re all set</h1>
              <p className="text-sm text-ink-dim mb-6">Redirecting you to sign in…</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetContent />
    </Suspense>
  );
}
