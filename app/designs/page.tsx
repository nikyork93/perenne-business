import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui';
import { DesignsList } from '@/components/designs/DesignsList';
import type { DesignSummaryWithThumb } from '@/components/designs/types';
import type { CoverAssetRef } from '@/types/cover';

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
      // Pulled so we can render a representative page-watermark
      // alongside the cover thumb in the library card.
      pageWatermarksJson: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { orders: true } },
    },
  });

  // Plain DesignSummary for the client (no Prisma types crossing the wire).
  // v39: pass the FULL asset arrays so the thumbnail can render every
  // logo / watermark with its real position/scale/rotation/opacity/invert,
  // not just the first one. The arrays are small (a few items) so the
  // payload cost is negligible.
  const initialDesigns: DesignSummaryWithThumb[] = designs.map((d) => {
    const coverAssets = extractAssetArray(d.assetsJson);
    const pageWatermarks = extractAssetArray(d.pageWatermarksJson);
    return {
      id: d.id,
      name: d.name,
      isDefault: d.isDefault,
      isArchived: d.isArchived,
      previewPngUrl: d.previewPngUrl,
      backgroundColor: d.backgroundColor,
      backgroundImageUrl: d.backgroundImageUrl,
      coverAssets,
      pageWatermarks,
      // Deprecated but kept until callers migrate away
      primaryAssetUrl: coverAssets[0]?.url ?? coverAssets[0]?.dataUrl ?? null,
      primaryWatermarkUrl: pageWatermarks[0]?.url ?? pageWatermarks[0]?.dataUrl ?? null,
      orderCount: d._count.orders,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  });

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
// Sanitize an assetsJson / pageWatermarksJson value from the DB into a
// strict CoverAssetRef[] safe to send to the client. Drops any entry
// without a URL or with malformed coords. Used for thumbnail render
// fidelity (v39: full snapshot, not just the first asset).
function extractAssetArray(json: unknown): CoverAssetRef[] {
  if (!Array.isArray(json)) return [];
  const out: CoverAssetRef[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const url = typeof r.url === 'string' ? r.url : undefined;
    const dataUrl = typeof r.dataUrl === 'string' ? r.dataUrl : undefined;
    if (!url && !dataUrl) continue; // unrenderable
    const x = typeof r.x === 'number' ? r.x : 0.5;
    const y = typeof r.y === 'number' ? r.y : 0.5;
    const scale = typeof r.scale === 'number' ? r.scale : 0.5;
    const rotation = typeof r.rotation === 'number' ? r.rotation : 0;
    const opacity = typeof r.opacity === 'number' ? r.opacity : 1;
    const invert = r.invert === true;
    const name = typeof r.name === 'string' ? r.name : '';
    out.push({ name, url, dataUrl, x, y, scale, rotation, opacity, invert });
  }
  return out;
}

// Backwards-compat helper still used by some callers (deprecated, will
// be removed once everything migrates to extractAssetArray).
function extractFirstAssetUrl(json: unknown): string | null {
  const arr = extractAssetArray(json);
  return arr[0]?.url ?? arr[0]?.dataUrl ?? null;
}
