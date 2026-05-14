import { requireRole } from '@/lib/auth';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { NewCompanyForm } from './NewCompanyForm';

export const metadata = {
  title: 'New company',
};

export default async function NewCompanyPage() {
  const session = await requireRole('SUPERADMIN');

  return (
    <Shell userEmail={session.email} isSuperAdmin={true}>
      <PageHeader
        eyebrow="Superadmin · Companies"
        title="New company"
        description="Onboard a new client. Fill in the company details and the owner email — they'll receive a magic link to sign in."
      />

      <NewCompanyForm />
    </Shell>
  );
}
