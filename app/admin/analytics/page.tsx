import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { AnalyticsClient } from './AnalyticsClient';

export const metadata = {
  title: 'Analytics',
};

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  const session = await requireRole('SUPERADMIN');

  const settings = await prisma.adminSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  const ascConfigured =
    !!settings.asc_keyId && !!settings.asc_issuerId &&
    !!settings.asc_privateKey && !!settings.asc_vendorId;
  const firebaseConfigured =
    !!settings.fb_serviceAccountJson && !!settings.fb_propertyId;

  return (
    <Shell userEmail={session.email} isSuperAdmin={true}>
      <PageHeader
        eyebrow="Superadmin · Analytics"
        title="Product analytics"
        description="App Store Connect installs + revenue, and Firebase Analytics user engagement, in one place."
      />
      <AnalyticsClient
        ascConfigured={ascConfigured}
        firebaseConfigured={firebaseConfigured}
        ascLastSync={settings.asc_lastSyncAt ? settings.asc_lastSyncAt.toISOString() : null}
        firebaseLastSync={settings.fb_lastSyncAt ? settings.fb_lastSyncAt.toISOString() : null}
      />
    </Shell>
  );
}
