import type { CoverAssetRef } from '@/types/cover';

/**
 * Lightweight design summary used by /designs list pages and APIs.
 * Mirrors the most-used columns from prisma.design without coupling
 * the client bundle to Prisma types.
 */
export interface DesignSummary {
  id: string;
  name: string;
  isDefault: boolean;
  isArchived: boolean;
  previewPngUrl: string | null;
  orderCount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/**
 * Extended summary used by the design library card. Adds the data the
 * thumbnail renderer needs to draw a faithful snapshot of the saved
 * design — full asset arrays (cover + page) with positions, scale,
 * rotation, opacity, and invert flag, just like iOS reads them.
 */
export interface DesignSummaryWithThumb
  extends Omit<DesignSummary, 'createdAt' | 'updatedAt'> {
  backgroundColor: string;
  backgroundImageUrl: string | null;

  /**
   * Cover assets (logos / patterns / etc.) saved for this design.
   * Empty array if nothing has been placed.
   */
  coverAssets: CoverAssetRef[];

  /**
   * Page watermarks saved for this design. These render on every
   * page in the iOS app (except the "Property of" page).
   */
  pageWatermarks: CoverAssetRef[];

  /**
   * @deprecated v39 — kept for backwards compatibility with old code
   * paths that read just the first asset URL. New code should use
   * coverAssets[0]?.url ?? null directly.
   */
  primaryAssetUrl: string | null;
  /** @deprecated v39 — see primaryAssetUrl note. Use pageWatermarks[0]?.url. */
  primaryWatermarkUrl: string | null;

  /** ISO-8601 — server pages serialize Dates to strings before sending */
  createdAt: string;
  updatedAt: string;
}
