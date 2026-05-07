import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { NewBatchForm } from '@/components/admin/NewBatchForm';

export const dynamic = 'force-dynamic';

export default async function NewBatchPage() {
  const session = await requireSession();
  if (session.role !== 'SUPERADMIN') {
    redirect('/dashboard');
  }

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });

  const designs = await prisma.design.findMany({
    select: { id: true, name: true, companyId: true, isArchived: true },
    where: { isArchived: false },
    orderBy: { name: 'asc' },
  });

  return (
    <Shell userEmail={session.email} isSuperAdmin>
      <div className="max-w-3xl mx-auto p-8">
        <PageHeader
          eyebrow="Superadmin · New batch"
          title="Issue codes to a company"
          description="Generate N codes and assign them to a company. The company admin will see them in their /codes page and distribute to their team."
        />
        <NewBatchForm companies={companies} designs={designs} />
      </div>
    </Shell>
  );
}
