import Link from 'next/link';
import { PerenneLogo } from '@/components/layout/PerenneLogo';

export default function LandingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-ink-bg relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 30% 40%, rgba(74,122,140,0.18) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(44,88,104,0.18) 0%, transparent 50%)',
        }}
      />

      <div className="relative w-full max-w-md flex flex-col items-center">
        <div className="mb-12 text-ink">
          <PerenneLogo variant="extended" height={42} />
        </div>

        <div className="w-full rounded-3xl border border-glass-border bg-glass-base/50 backdrop-blur-2xl p-10 shadow-glass-lg">
          <div className="text-center">
            <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-3">
              Business portal
            </div>
            <h1 className="font-display italic text-4xl tracking-tight mb-4 text-ink">
              Notebooks for your team
            </h1>
            <p className="text-sm text-ink-dim leading-relaxed mb-10 max-w-sm mx-auto">
              Design custom covers, purchase code packs, distribute branded notebooks
              to every employee.
            </p>

            <Link
              href="/login"
              className="inline-flex items-center justify-center px-7 py-3 rounded-2xl bg-accent text-white text-sm font-medium tracking-wide hover:bg-accent-bright transition-all duration-200 shadow-lg shadow-accent/20 hover:shadow-accent/30 hover:-translate-y-0.5"
            >
              Sign in →
            </Link>

            <div className="mt-6 text-[11px] text-ink-faint font-mono">
              No password. We&apos;ll email you a sign-in link.
            </div>
          </div>
        </div>

        <div className="mt-8 text-[10px] font-mono text-ink-faint tracking-widest uppercase">
          v1 · Perenne Note for Business · 2026
        </div>
      </div>
    </main>
  );
}
