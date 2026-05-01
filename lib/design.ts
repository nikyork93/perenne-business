/**
 * Design library helpers — keep the API routes thin by centralising
 * the snapshot/serialization logic and the legacy CoverConfig dual-
 * write here.
 */

import type { Design as PrismaDesign, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { CoverAssetRef } from '@/types/cover';
import type { DesignSnapshot } from '@/types/design';

// ─── Snapshot ───────────────────────────────────────────────────────
//
// Build the immutable DesignSnapshot stored on Order.designSnapshotJson.
// This is the SOLE format iOS will read post-Session-3, so it must be
// fully self-contained (no FK dereferences needed at read time).

export function buildDesignSnapshot(design: PrismaDesign): DesignSnapshot {
  return {
    v: 1,
    backgroundColor: design.backgroundColor,
    backgroundImageUrl: design.backgroundImageUrl ?? null,
    assets: (design.assetsJson as unknown as CoverAssetRef[]) ?? [],
    pageWatermarks:
      (design.pageWatermarksJson as unknown as CoverAssetRef[] | null) ?? [],
    quote: design.quoteText
      ? {
          text: design.quoteText,
          position: design.quotePosition ?? 'bottom',
          color: design.quoteColor ?? '#ffffff',
        }
      : null,
  };
}

// ─── Default design accessor ────────────────────────────────────────
//
// Every company should have exactly one default design after the
// migration runs. New companies created post-migration may not have
// one yet; in that case we lazily create an empty placeholder.

export async function getOrCreateDefaultDesign(
  companyId: string
): Promise<PrismaDesign> {
  const existing = await prisma.design.findFirst({
    where: { companyId, isDefault: true, isArchived: false },
  });
  if (existing) return existing;

  // Auto-create a placeholder Default. Useful for newly-onboarded
  // companies that haven't run the editor yet.
  return prisma.design.create({
    data: {
      companyId,
      name: 'Default',
      isDefault: true,
      backgroundColor: '#1a1a1a',
      assetsJson: [] as unknown as Prisma.InputJsonValue,
      pageWatermarksJson: [] as unknown as Prisma.InputJsonValue,
      quotePosition: 'bottom',
      quoteColor: '#ffffff',
    },
  });
}

// ─── Atomic set-default ─────────────────────────────────────────────
//
// Mark exactly one design as default for a company. Wrapped in a
// transaction so we never end up with zero or two defaults.

export async function setDesignAsDefault(designId: string, companyId: string) {
  return prisma.$transaction(async (tx) => {
    // Unset any current default
    await tx.design.updateMany({
      where: { companyId, isDefault: true, NOT: { id: designId } },
      data: { isDefault: false },
    });
    // Set the target as default (and ensure it's not archived)
    return tx.design.update({
      where: { id: designId },
      data: { isDefault: true, isArchived: false },
    });
  });
}

// ─── Legacy CoverConfig dual-write ──────────────────────────────────
//
// During the transition (Sessions 1–3 of the rollout), iOS still
// reads from CoverConfig.isActive=true. To keep iOS working while
// the Design library is the new source of truth, every write to the
// DEFAULT design also bumps the company's active CoverConfig with the
// same content. Non-default designs never touch CoverConfig (they're
// templates, not the live brand).
//
// After Session 3 (iOS reads Order.designSnapshotJson), this function
// can be retired and CoverConfig table dropped.

export async function syncCoverConfigFromDesign(design: PrismaDesign) {
  if (!design.isDefault) return; // only the default mirrors to CoverConfig

  // Find latest version number to increment
  const latest = await prisma.coverConfig.findFirst({
    where: { companyId: design.companyId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    // Mark all existing as inactive
    await tx.coverConfig.updateMany({
      where: { companyId: design.companyId, isActive: true },
      data: { isActive: false },
    });
    // Create new active version mirroring the design
    await tx.coverConfig.create({
      data: {
        companyId: design.companyId,
        version: nextVersion,
        isActive: true,
        backgroundColor: design.backgroundColor,
        backgroundImageUrl: design.backgroundImageUrl,
        assetsJson: design.assetsJson as unknown as Prisma.InputJsonValue,
        pageWatermarksJson:
          (design.pageWatermarksJson ?? null) as unknown as Prisma.InputJsonValue | null,
        quoteText: design.quoteText,
        quotePosition: design.quotePosition,
        quoteColor: design.quoteColor,
        previewPngUrl: design.previewPngUrl,
      } as unknown as Parameters<typeof tx.coverConfig.create>[0]['data'],
    });
  });
}
