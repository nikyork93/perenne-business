import type { DesignSummary } from '@/types/design';

/**
 * View-layer extension of DesignSummary that carries the bits we need
 * to render thumbnails on the /designs library page. Lives in its own
 * file to avoid a client component importing from a server page (which
 * would work via type-only import, but is bad architecture).
 */
export interface DesignSummaryWithThumb
  extends Omit<DesignSummary, 'createdAt' | 'updatedAt'> {
  backgroundColor: string;
  backgroundImageUrl: string | null;
  /** First cover asset URL — used for the cover thumb preview */
  primaryAssetUrl: string | null;
  /** First page-watermark URL — used for the page thumb preview (right side of card) */
  primaryWatermarkUrl: string | null;
  /** ISO-8601 — server pages serialize Dates to strings before sending */
  createdAt: string;
  updatedAt: string;
}
