import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DistributionClient } from '@/components/DistributionClient';

export default async function DistributionPage() {
  const session = await requireSession();
  if (!session.companyId) {
    const { redirect } = await import('next/navigation');
    redirect('/onboarding');
  }

  const [company, availableCodes, batches] = await Promise.all([
    prisma.company.findUnique({ where: { id: session.companyId } }),
    prisma.notebookCode.count({
      where: { companyId: session.companyId, status: 'AVAILABLE', distributionId: null },
    }),
    prisma.distributionBatch.findMany({
      where: { companyId: session.companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return (
    <Shell
      companyName={company?.name}
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
