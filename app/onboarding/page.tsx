import { requireSession } from '@/lib/auth';
import { GlassPanel } from '@/components/ui';
import { OnboardingForm } from '@/components/OnboardingForm';

export const metadata = {
  title: 'Onboarding',
};

export default async function OnboardingPage() {
  const session = await requireSession();

  // Already onboarded? Go to dashboard
  if (session.companyId! || session.role === 'SUPERADMIN') {
    const { redirect } = await import('next/navigation');
    redirect('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <GlassPanel animate padding="lg" className="max-w-lg w-full">
        <div className="label mb-2 text-accent">Welcome</div>
        <h1 className="font-display italic text-4xl tracking-tight mb-3">
          Set up your company
        </h1>
        <p className="text-sm text-ink-dim leading-relaxed mb-8">
          Signed in as <span className="text-ink font-mono text-xs">{session.email}</span>.
          Let&apos;s create your company profile.
        </p>

        <OnboardingForm />

        <div className="mt-8 pt-5 border-t border-glass-border flex justify-between items-center">
          <span className="text-[11px] text-ink-faint">
            You can edit these details later.
          </span>
          <a
            href="/api/auth/logout"
            className="text-xs text-ink-faint hover:text-ink transition-colors"
          >
            Sign out
          </a>
        </div>
      </GlassPanel>
    </main>
  );
}
