import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { StoreGrid } from '@/components/StoreGrid';
import { GlassPanel, Whisper } from '@/components/ui';

interface Props {
  searchParams: Promise<{ cancelled?: string }>;
}

export const metadata = {
  title: 'Store',
};

export default async function StorePage({ searchParams }: Props) {
  const session = await requireSession();
  if (!session.companyId) {
    redirect('/onboarding');
  }

  const companyId = session.companyId;
  const company = await prisma.company.findUnique({ where: { id: companyId } });

  const params = await searchParams;
  const cancelled = params.cancelled === '1';

  return (
    <Shell
      companyName={company?.name}
      companyLogoUrl={company?.logoSymbolUrl}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Store"
        title="Buy notebook codes"
        description="Choose a pack. Each code unlocks one branded notebook for one employee — for life."
      />

      {cancelled && (
        <div className="mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-amber-400/5 border-amber-400/20 text-amber-200">
          ⊘ Checkout cancelled. You can try again any time.
        </div>
      )}

      {session.role !== 'OWNER' && session.role !== 'SUPERADMIN' && (
        <GlassPanel padding="md" className="mb-6">
          <Whisper>
            Only the company OWNER can purchase packs. Contact your OWNER to place an order.
          </Whisper>
        </GlassPanel>
      )}

      <Suspense fallback={<div className="text-ink-faint text-xs">Loading pricing…</div>}>
        <StoreGrid />
      </Suspense>

      <div className="mt-10 pt-6 border-t border-glass-border text-[11px] text-ink-faint font-mono">
        All prices in EUR, VAT reverse-charge for EU B2B.
      </div>
    </Shell>
  );
}
