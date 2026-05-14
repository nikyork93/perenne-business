import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DistributionClient } from '@/components/DistributionClient';

export const metadata = {
  title: 'Distribution',
};

export default async function DistributionPage() {
  const session = await requireSession();
  if (!session.companyId) {
    redirect('/onboarding');
  }

  const companyId = session.companyId;

  const [company, availableCodes, batches] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.notebookCode.count({
      where: { companyId, status: 'AVAILABLE', distributionId: null },
    }),
    prisma.distributionBatch.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return (
    <Shell
      companyName={company?.name}
      companyLogoUrl={company?.logoSymbolUrl}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Distribution"
        title="Send codes to your team"
        description="Upload a CSV of employee emails, customize the message, and send activation codes in one batch."
      />

      <DistributionClient
        availableCodes={availableCodes}
        companyName={company?.name ?? 'your company'}
        batches={batches.map((b) => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
          completedAt: b.completedAt?.toISOString() ?? null,
        }))}
      />
    </Shell>
  );
}
