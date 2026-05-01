import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { LegacyCodesClient } from '@/components/admin/LegacyCodesClient';

/**
 * /admin/legacy-codes — manual team-code admin (replaces the old
 * Cloudflare Worker admin panel at api.perenne.app/admin).
 *
 * Lists every LegacyTeamCode with search + per-row actions. SUPERADMIN
 * only — these are cross-company codes (partners, demos, trade shows,
 * gifts) that don't go through Stripe. Regular OWNERs use /store +
 * /designs to issue Stripe-paid codes.
 */
export default async function LegacyCodesPage() {
  const session = await requireSession();
  if (session.role !== 'SUPERADMIN') redirect('/dashboard');

  // Fetch initial page server-side for fast first paint. Client takes
  // over after that (search, paginate, mutate).
  const [codes, total, companies, designs] = await Promise.all([
    prisma.legacyTeamCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        company: { select: { id: true, name: true, slug: true } },
        design: { select: { id: true, name: true } },
      },
    }),
    prisma.legacyTeamCode.count(),
    // Companies + designs for the create-code form's dropdowns
    prisma.company.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    }),
    prisma.design.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, companyId: true },
      orderBy: [{ companyId: 'asc' }, { name: 'asc' }],
    }),
  ]);

  // Serialize Dates for client boundary
  const serialized = codes.map((c) => ({
    ...c,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <Shell
      userEmail={session.email}
      isSuperAdmin
    >
      <PageHeader
        eyebrow="Superadmin"
        title="Legacy team codes"
        description="Manual codes not tied to a Stripe purchase — partners, demos, trade shows, gifts. Resolved by api.perenne.app/team/{CODE} alongside Stripe-issued NotebookCodes."
      />

      <LegacyCodesClient
        initialCodes={serialized}
        initialTotal={total}
        companies={companies}
        designs={designs}
      />
    </Shell>
  );
}
