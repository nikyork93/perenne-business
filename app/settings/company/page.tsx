import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import {
  CompanySettingsForm,
  type CompanyShape,
} from '@/components/settings/CompanySettingsForm';

export const dynamic = 'force-dynamic';

/**
 * /settings/company — company information & brand assets editor.
 *
 * Visible to OWNER + ADMIN of the company (and SUPERADMIN). Members
 * with no edit privileges land here read-only via the same UI; the
 * server route refuses their PATCH so the Save button silently fails
 * — but a normal MEMBER would never reach this page through the nav,
 * so we don't show a banner. (If/when we expose this in the MEMBER
 * sidebar, we'll add a read-only mode.)
 */
export default async function CompanySettingsPage() {
  const session = await requireSession();
  if (!session.companyId) {
    redirect('/dashboard');
  }
  const allowed =
    session.role === 'OWNER' ||
    session.role === 'ADMIN' ||
    session.role === 'SUPERADMIN';
  if (!allowed) {
    redirect('/dashboard');
  }

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: {
      id: true,
      slug: true,
      name: true,
      legalName: true,
      vatNumber: true,
      taxCode: true,
      address: true,
      city: true,
      zipCode: true,
      country: true,
      sdiCode: true,
      pecEmail: true,
      logoSymbolUrl: true,
      logoExtendedUrl: true,
      primaryColor: true,
    },
  });
  if (!company) {
    redirect('/dashboard');
  }

  return (
    <Shell
      userEmail={session.email}
      companyName={company.name}
      companyLogoUrl={company.logoSymbolUrl}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Company"
          description="Edit your company info and brand assets. Changes propagate to invoices, emails, the iPad welcome screen, and this portal's sidebar."
        />
        <CompanySettingsForm initial={company as CompanyShape} />
      </div>
    </Shell>
  );
}
