import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { TeamClient } from '@/components/TeamClient';

export default async function TeamPage() {
  const session = await requireSession();
  if (!session.companyId) {
    redirect('/onboarding');
  }

  const companyId = session.companyId;

  const [company, members] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        lastLoginAt: true,
        invitedByEmail: true,
        invitedAt: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const canManage = session.role === 'OWNER' || session.role === 'SUPERADMIN';

  return (
    <Shell
      companyName={company?.name}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Settings · Team"
        title="Team members"
        description="Invite admins to help you manage codes and distribution."
      />

      <TeamClient
        members={members.map((m) => ({
          ...m,
          lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
          invitedAt: m.invitedAt?.toISOString() ?? null,
          createdAt: m.createdAt.toISOString(),
        }))}
        currentUserId={session.userId}
        canManage={canManage}
      />
    </Shell>
  );
}
