import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { AdminSettingsForm } from './AdminSettingsForm';

export const metadata = {
  title: 'Platform settings',
};

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const session = await requireRole('SUPERADMIN');

  const row = await prisma.adminSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  return (
    <Shell userEmail={session.email} isSuperAdmin={true}>
      <PageHeader
        eyebrow="Superadmin · Platform"
        title="Platform settings"
        description="Bank transfer coordinates customers see at checkout and on their invoices."
      />
      <AdminSettingsForm initial={row} />
    </Shell>
  );
}
