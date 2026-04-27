import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel } from '@/components/ui';
import { SettingsForm } from '@/components/SettingsForm';

export default async function SettingsPage() {
  const session = await requireSession();

  if (!session.companyId) {
    const { redirect } = await import('next/navigation');
    redirect('/onboarding');
  }

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
  });

  if (!company) {
    const { redirect } = await import('next/navigation');
    redirect('/onboarding');
  }

  const canEditFiscal = session.role === 'OWNER' || session.role === 'SUPERADMIN';

  return (
    <Shell
      companyName={company.name}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <div className="max-w-2xl">
        <PageHeader
          eyebrow="Settings"
          title="Company"
          description="Manage company details, fiscal information, and brand preferences."
        />

        <GlassPanel padding="lg">
          <SettingsForm company={company} canEditFiscal={canEditFiscal} />
        </GlassPanel>
      </div>
    </Shell>
  );
}
