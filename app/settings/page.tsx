import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsTabs } from './SettingsTabs';

export const metadata = {
  title: 'Settings',
};

interface SearchParams {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: SearchParams) {
  const session = await requireSession();

  if (!session.companyId) {
    redirect('/onboarding');
  }

  const sp = await searchParams;
  const initialTab = sp.tab === 'users' || sp.tab === 'brand' ? sp.tab : 'company';

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
  });

  if (!company) {
    redirect('/onboarding');
  }

  const canEditFiscal = session.role === 'OWNER' || session.role === 'SUPERADMIN';

  return (
    <Shell
      companyName={company.name}
      companyLogoUrl={company.logoSymbolUrl}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Settings"
        title="Workspace"
        description="Company info, team members, and brand assets — one place."
      />
      <SettingsTabs
        initialTab={initialTab}
        company={company}
        canEditFiscal={canEditFiscal}
        currentUserId={session.userId}
        currentUserRole={session.role}
      />
    </Shell>
  );
}
