import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { CodesTable } from '@/components/CodesTable';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function CodesPage() {
  const session = await requireSession();

  let companyName: string | undefined;
  if (session.companyId) {
    const c = await prisma.company.findUnique({
      where: { id: session.companyId },
      select: { name: true },
    });
    companyName = c?.name;
  }

  return (
    <Shell
      companyName={companyName}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <div className="max-w-7xl mx-auto p-8">
        <PageHeader
          eyebrow="Distribution"
          title="Notebook codes"
          description="Codes issued to your company. Assign them to your team members so they can activate Perenne Note on their iPad."
        />
        <CodesTable />
      </div>
    </Shell>
  );
}
