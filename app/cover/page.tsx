import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { EditorClient } from '@/components/editor/EditorClient';
import type { CoverConfigData, CoverAssetRef } from '@/types/cover';
import { DEFAULT_COVER_CONFIG } from '@/types/cover';

export default async function CoverPage() {
  const session = await requireSession();

  if (!session.companyId) {
    redirect('/onboarding');
  }

  const companyId = session.companyId;

  const [company, activeConfig] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.coverConfig.findFirst({
      where: { companyId, isActive: true },
      orderBy: { version: 'desc' },
    }),
  ]);

  // Defensive any-cast for new fields in case Prisma client wasn't regenerated yet
  const extra = activeConfig as unknown as {
    backgroundImageUrl?: string | null;
    pageWatermarksJson?: unknown;
  } | null;

  const initialConfig: CoverConfigData = activeConfig
    ? {
        version: activeConfig.version,
        canvas: DEFAULT_COVER_CONFIG.canvas,
        cover: {
          backgroundColor: activeConfig.backgroundColor,
          backgroundImageUrl: extra?.backgroundImageUrl ?? undefined,
          assets: (activeConfig.assetsJson as unknown as CoverAssetRef[]) ?? [],
          quote: activeConfig.quoteText
            ? {
                text: activeConfig.quoteText,
                position: (activeConfig.quotePosition as 'top' | 'center' | 'bottom') ?? 'bottom',
                color: activeConfig.quoteColor ?? '#ffffff',
              }
            : undefined,
        },
        pageWatermarks: (extra?.pageWatermarksJson as CoverAssetRef[] | null) ?? [],
      }
    : DEFAULT_COVER_CONFIG;

  return (
    <Shell
      companyName={company?.name}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <PageHeader
        eyebrow={`Version ${activeConfig?.version ?? 0}`}
        title="Editor"
        description="Design the cover and page watermarks of your company notebooks. Switch between tabs to edit each section."
      />
      <EditorClient initialConfig={initialConfig} />
    </Shell>
  );
}
