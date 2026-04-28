import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { UsersListClient } from './UsersListClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await requireRole('SUPERADMIN');

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });

  return (
    <Shell
      userEmail={session.email}
      isSuperAdmin
      companyName={null}
    >
      <UsersListClient companies={companies} currentUserId={session.userId} />
    </Shell>
  );
}
