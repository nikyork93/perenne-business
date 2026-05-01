import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { NewDesignForm } from '@/components/designs/NewDesignForm';
import type { DesignSummary } from '@/types/design';

/**
 * /designs/new — create a new design.
 *
 * Form: name (required) + optional "copy from" dropdown listing the
 * company's existing designs. Submission POSTs to /api/designs and
 * redirects to /designs/[id]/edit on success.
 *
 * VIEWER role bounced back to /designs.
 */
export default async function NewDesignPage() {
  const session = await requireSession();
  if (!session.companyId) redirect('/onboarding');

  if (session.role === 'VIEWER') redirect('/designs');

  const [company, existing] = await Promise.all([
    prisma.company.findUnique({
      where: { id: session.companyId },
      select: { name: true },
    }),
    prisma.design.findMany({
      where: { companyId: session.companyId, isArchived: false },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        isDefault: true,
        isArchived: true,
        previewPngUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const summaries: DesignSummary[] = existing.map((d) => ({
    id: d.id,
    name: d.name,
    isDefault: d.isDefault,
    isArchived: d.isArchived,
    previewPngUrl: d.previewPngUrl,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));

  return (
    <Shell
      companyName={company?.name}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Library"
        title="New design"
        description="Give your design a name. Optionally start from a copy of an existing one."
      />

      <NewDesignForm existingDesigns={summaries} />
    </Shell>
  );
}
