import { Shell } from '@/components/layout/Shell';
import { CodesTable } from '@/components/CodesTable';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function CodesPage() {
  const session = await requireSession();

  let companyName: string | undefined;
  if (session.companyId) {
    const c = await prisma.company.findUnique({
      where: { id: session.companyId },
      select: { name: true },
    });
    companyName = c?.name;
  }

  return (
    <Shell
      companyName={companyName}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <div className="max-w-7xl mx-auto p-8 space-y-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-ink-faint font-mono mb-2">
            Codes
          </div>
          <h1 className="text-3xl font-light text-ink">Notebook codes</h1>
          <p className="text-sm text-ink-dim mt-2 max-w-2xl">
            Codes issued to your company. Assign them to your team members so
            they can activate Perenne Note on their iPad.
          </p>
        </div>

        <CodesTable />
      </div>
    </Shell>
  );
}
