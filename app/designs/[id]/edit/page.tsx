import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { Badge, Button } from '@/components/ui';
import { EditorClient } from '@/components/editor/EditorClient';
import { InlineDesignName } from '@/components/designs/InlineDesignName';
import type { CoverConfigData, CoverAssetRef } from '@/types/cover';
import { DEFAULT_COVER_CONFIG } from '@/types/cover';

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

  const initialConfig: CoverConfigData = {
    version: 1,
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
      <header className="flex items-start justify-between gap-6 mb-8">
        <div className="min-w-0 flex-1">
          <div className="label mb-2">Library · editing design</div>
          <h1 className="font-display italic text-[38px] leading-[1.05] tracking-tight text-ink min-w-0">
            <InlineDesignName
              designId={design.id}
              initialName={design.name}
              className="font-display italic text-[38px] leading-[1.05] tracking-tight"
            />
          </h1>
          <p className="mt-3 text-sm text-ink-dim max-w-2xl leading-relaxed">
            Click the name to rename. Save Cover and Save Watermarks work
            independently. When you&apos;re finished, click <strong>Done</strong>
            to return to your designs.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {design.isDefault && <Badge tone="accent">Default</Badge>}
          {/* v41 — clear, prominent exit. The previous "← All designs" link
              was easy to miss, so users felt stuck inside the editor. */}
          <Link href="/designs">
            <Button variant="primary">Done →</Button>
          </Link>
        </div>
      </header>

      <EditorClient
        initialConfig={initialConfig}
        designId={design.id}
        designName={design.name}
        readOnly={!canEdit}
      />
    </Shell>
  );
}
