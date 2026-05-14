import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { EditCompanyForm } from './EditCompanyForm';

export const metadata = {
  title: 'Edit company',
};

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole('SUPERADMIN');
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      _count: { select: { users: true, notebookCodes: true, orders: true } },
    },
  });

  if (!company) notFound();

  return (
    <Shell userEmail={session.email} isSuperAdmin={true}>
      <PageHeader
        eyebrow={`Superadmin · ${company.slug}`}
        title={`Edit ${company.name}`}
        description={`${company._count.users} users · ${company._count.notebookCodes} codes · ${company._count.orders} orders`}
      />

      <EditCompanyForm
        company={{
          id: company.id,
          name: company.name,
          slug: company.slug,
          legalName: company.legalName,
          vatNumber: company.vatNumber,
          taxCode: company.taxCode,
          address: company.address,
          city: company.city,
          zipCode: company.zipCode,
          country: company.country,
          sdiCode: company.sdiCode,
          pecEmail: company.pecEmail,
          primaryColor: company.primaryColor,
          logoExtendedUrl: company.logoExtendedUrl,
          logoSymbolUrl: company.logoSymbolUrl,
        }}
      />
    </Shell>
  );
}
