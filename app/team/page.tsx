import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { TeamClient } from '@/components/TeamClient';

export default async function TeamPage() {
  const session = await requireSession();
  if (!session.companyId) {
    const { redirect } = await import('next/navigation');
    redirect('/onboarding');
  }

  const [company, members] = await Promise.all([
    prisma.company.findUnique({ where: { id: session.companyId } }),
    prisma.user.findMany({
      where: { companyId: session.companyId },
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
        description="Invite admins to help you manage codes and distribution. Only the OWNER can invite or remove team members."
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
