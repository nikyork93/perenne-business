import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Stat } from '@/components/ui/Stat';
import { CodesTable } from '@/components/CodesTable';

export const metadata = {
  title: 'Codes',
};

export default async function CodesPage() {
  const session = await requireSession();
  if (!session.companyId) {
    redirect('/onboarding');
  }

  const companyId = session.companyId;

  const [company, total, claimed, available, revoked] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.notebookCode.count({ where: { companyId } }),
    prisma.notebookCode.count({ where: { companyId, status: 'CLAIMED' } }),
    prisma.notebookCode.count({ where: { companyId, status: 'AVAILABLE' } }),
    prisma.notebookCode.count({ where: { companyId, status: 'REVOKED' } }),
  ]);

  const claimRate = total > 0 ? Math.round((claimed / total) * 100) : 0;

  return (
    <Shell
      companyName={company?.name}
      companyLogoUrl={company?.logoSymbolUrl}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Codes"
        title="Notebook codes"
        description="Every code unlocks one branded notebook for one employee, for life."
      />

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <Stat label="Total" value={total} />
        <Stat label="Available" value={available} hint="ready to distribute" />
        <Stat label="Claimed" value={claimed} hint={`${claimRate}% activation`} />
        <Stat label="Revoked" value={revoked} />
      </div>

      <CodesTable />
    </Shell>
  );
}
