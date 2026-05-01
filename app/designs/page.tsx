import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui';
import { DesignsList } from '@/components/designs/DesignsList';
import type { DesignSummaryWithThumb } from '@/components/designs/types';

/**
 * /designs — the design library.
 *
 * Lists every non-archived Design for the current company, with
 * thumbnails, "Default" badge, and per-design actions (edit, set
 * default, duplicate, archive). The "+ New design" CTA goes to
 * /designs/new.
 *
 * Read-only for VIEWER role; OWNER/ADMIN can edit and create.
 */
export default async function DesignsPage() {
  const session = await requireSession();
  if (!session.companyId) {
    redirect('/onboarding');
  }

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true },
  });

  // Pre-fetch on the server (avoids a client-side spinner on first paint).
  // Client component re-fetches after mutations (create/duplicate/archive)
  // to stay in sync.
  const designs = await prisma.design.findMany({
    where: { companyId: session.companyId, isArchived: false },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      isDefault: true,
      isArchived: true,
      previewPngUrl: true,
      backgroundColor: true,
      backgroundImageUrl: true,
      assetsJson: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { orders: true } },
    },
  });

  // Plain DesignSummary for the client (no Prisma types crossing the wire)
  const initialDesigns: DesignSummaryWithThumb[] = designs.map((d) => ({
    id: d.id,
    name: d.name,
    isDefault: d.isDefault,
    isArchived: d.isArchived,
    previewPngUrl: d.previewPngUrl,
    backgroundColor: d.backgroundColor,
    backgroundImageUrl: d.backgroundImageUrl,
    // Send only the first asset for thumbnail purposes (lightweight payload)
    primaryAssetUrl: extractFirstAssetUrl(d.assetsJson),
    orderCount: d._count.orders,
    // Serialize Date → ISO string so the server-component-to-client boundary
    // doesn't barf on Date instances.
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));

  const canEdit = session.role === 'OWNER' || session.role === 'ADMIN' || session.role === 'SUPERADMIN';

  return (
    <Shell
      companyName={company?.name}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Library"
        title="Designs"
        description="Your reusable notebook designs. Each batch of codes you buy is locked to the design you choose at checkout — editing a design later won't change notebooks already shipped."
        actions={
          canEdit ? (
            <Link href="/designs/new">
              <Button variant="primary">+ New design</Button>
            </Link>
          ) : undefined
        }
      />

      <DesignsList initialDesigns={initialDesigns} canEdit={canEdit} />
    </Shell>
  );
}

// Pull the first uploaded asset's URL out of the assetsJson blob.
// Used for thumbnail rendering — lets us show a logo on the card
// without sending the whole assets array down the wire.
function extractFirstAssetUrl(json: unknown): string | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const first = json[0] as { url?: unknown };
  return typeof first.url === 'string' ? first.url : null;
}
