import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Stat } from '@/components/ui/Stat';
import { CodesTable } from '@/components/CodesTable';

export default async function CodesPage() {
  const session = await requireSession();
  if (!session.companyId!) {
    const { redirect } = await import('next/navigation');
    redirect('/onboarding');
  }

  const [company, total, claimed, available, revoked] = await Promise.all([
    prisma.company.findUnique({ where: { id: session.companyId! } }),
    prisma.notebookCode.count({ where: { companyId: session.companyId! } }),
    prisma.notebookCode.count({ where: { companyId: session.companyId!, status: 'CLAIMED' } }),
    prisma.notebookCode.count({ where: { companyId: session.companyId!, status: 'AVAILABLE' } }),
    prisma.notebookCode.count({ where: { companyId: session.companyId!, status: 'REVOKED' } }),
  ]);

  const claimRate = total > 0 ? Math.round((claimed / total) * 100) : 0;

  return (
    <Shell
      companyName={company?.name}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Codes"
        title="Notebook codes"
        description="Every code unlocks one branded notebook for one employee, for life. Distribute manually or via CSV upload."
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
