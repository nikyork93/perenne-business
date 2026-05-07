import { Shell } from '@/components/layout/Shell';
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

  // Pre-load designs for all companies (we'll filter client-side based on company selection)
  const designs = await prisma.design.findMany({
    select: { id: true, name: true, companyId: true, isArchived: true },
    where: { isArchived: false },
    orderBy: { name: 'asc' },
  });

  return (
    <Shell userEmail={session.email} isSuperAdmin>
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-ink-faint font-mono mb-2">
            Superadmin · New batch
          </div>
          <h1 className="text-3xl font-light text-ink">Issue codes to a company</h1>
          <p className="text-sm text-ink-dim mt-2">
            Generate N codes and assign them to a company. The company admin
            will see them in their <code>/codes</code> page and distribute to
            their team.
          </p>
        </div>

        <NewBatchForm companies={companies} designs={designs} />
      </div>
    </Shell>
  );
}
