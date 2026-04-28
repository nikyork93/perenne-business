import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { TeamListClient } from './TeamListClient';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const session = await requireRole(['OWNER', 'ADMIN', 'VIEWER']);

  const company = session.companyId
    ? await prisma.company.findUnique({
        where: { id: session.companyId },
        select: { name: true },
      })
    : null;

  return (
    <Shell
      userEmail={session.email}
      isSuperAdmin={false}
      companyName={company?.name ?? null}
    >
      <TeamListClient
        companyName={company?.name ?? 'your company'}
        currentUserId={session.userId}
        currentUserRole={session.role}
      />
    </Shell>
  );
}
