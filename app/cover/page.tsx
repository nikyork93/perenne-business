import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { CoverEditorClient } from '@/components/editor/CoverEditorClient';
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

  const initialConfig: CoverConfigData = activeConfig
    ? {
        version: activeConfig.version,
        canvas: DEFAULT_COVER_CONFIG.canvas,
        cover: {
          backgroundColor: activeConfig.backgroundColor,
          assets: (activeConfig.assetsJson as unknown as CoverAssetRef[]) ?? [],
          quote: activeConfig.quoteText
            ? {
                text: activeConfig.quoteText,
                position: (activeConfig.quotePosition as 'top' | 'center' | 'bottom') ?? 'bottom',
                color: activeConfig.quoteColor ?? '#ffffff',
              }
            : undefined,
        },
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
        title="Cover Editor"
        description="Design the cover of your company notebooks. Upload logos, position them, and save a version to apply to all future notebook codes."
      />
      <CoverEditorClient initialConfig={initialConfig} />
    </Shell>
  );
}
