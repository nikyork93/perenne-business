import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button } from '@/components/ui';
import { EditorClient } from '@/components/editor/EditorClient';
import type { CoverConfigData, CoverAssetRef } from '@/types/cover';
import { DEFAULT_COVER_CONFIG } from '@/types/cover';

/**
 * /designs/[id]/edit — the editor parametrized by designId.
 *
 * Replaces the old /cover route which assumed "the active CoverConfig".
 * Now every editor session is scoped to one specific Design row, and
 * saves go to PATCH /api/designs/[id] instead of POST /api/cover.
 *
 * Design.assetsJson and pageWatermarksJson share the same shape as
 * the legacy CoverConfig fields, so the editor itself doesn't need to
 * change — only EditorClient learns the new endpoint.
 */
interface Props {
  params: Promise<{ id: string }>;
}

export default async function DesignEditPage({ params }: Props) {
  const { id } = await params;
  const session = await requireSession();
  if (!session.companyId) redirect('/onboarding');

  const [company, design] = await Promise.all([
    prisma.company.findUnique({
      where: { id: session.companyId },
      select: { name: true },
    }),
    prisma.design.findFirst({
      where: { id, companyId: session.companyId },
    }),
  ]);

  if (!design) notFound();

  // Hydrate into the same CoverConfigData shape the editor already
  // consumes — keeps the editor unchanged.
  const initialConfig: CoverConfigData = {
    version: 1, // Designs don't have versions; editor only displays it
    canvas: DEFAULT_COVER_CONFIG.canvas,
    cover: {
      backgroundColor: design.backgroundColor,
      backgroundImageUrl: design.backgroundImageUrl ?? undefined,
      assets: (design.assetsJson as unknown as CoverAssetRef[]) ?? [],
      quote: design.quoteText
        ? {
            text: design.quoteText,
            position:
              (design.quotePosition as 'top' | 'center' | 'bottom') ?? 'bottom',
            color: design.quoteColor ?? '#ffffff',
          }
        : undefined,
    },
    pageWatermarks:
      (design.pageWatermarksJson as CoverAssetRef[] | null) ?? [],
  };

  const canEdit =
    session.role === 'OWNER' || session.role === 'ADMIN' || session.role === 'SUPERADMIN';

  return (
    <Shell
      companyName={company?.name}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow="Library · editing design"
        title={design.name}
        description="Edit the cover and the page watermarks. Saves are independent — Save Cover and Save Watermarks work separately."
        actions={
          <div className="flex items-center gap-2">
            {design.isDefault && <Badge tone="accent">Default</Badge>}
            <Link href="/designs">
              <Button variant="ghost">← All designs</Button>
            </Link>
          </div>
        }
      />

      <EditorClient
        initialConfig={initialConfig}
        designId={design.id}
        designName={design.name}
        readOnly={!canEdit}
      />
    </Shell>
  );
}
