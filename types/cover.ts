/**
 * Cover + Pages config — serialized shape stored in DB and consumed by iOS.
 * Coordinates are normalized 0-1 so they render at any resolution.
 *
 * Canvas dimensions match the Swift app physical notebook:
 * single page = 725 × 1000 → ratio 0.725.
 * Editor uses 392 × 540 (same ratio) for cover AND page editor.
 *
 * Corner radius on cover = 16pt at 725 width → 16/725 ≈ 2.2%
 *   → on 392px editor canvas = ~9px.
 */
export interface CoverConfigData {
  version: number;
  canvas: { width: number; height: number };
  cover: {
    backgroundColor: string;
    /** Optional pattern/image background uploaded by company */
    backgroundImageUrl?: string;
    assets: CoverAssetRef[];
    quote?: {
      text: string;
      position: 'top' | 'center' | 'bottom';
      color: string;
    };
  };
  /**
   * Watermarks rendered on every page of the notebook EXCEPT the
   * "Property of a thinking human" page (page index 1).
   * Same coordinate system as cover assets (0-1 normalized).
   */
  pageWatermarks?: CoverAssetRef[];
}

export interface CoverAssetRef {
  /** Human-readable name (original filename) */
  name: string;
  /** Persistent URL (set after upload to R2) */
  url?: string;
  /** Temporary data URL during editing (before upload) */
  dataUrl?: string;
  /** Normalized position [0-1] */
  x: number;
  y: number;
  /** Scale factor (1.0 = natural pixel size). Always uniform — proportions locked. */
  scale: number;
  /** Rotation in degrees [-180, 180] */
  rotation: number;
  /** Opacity [0-1] */
  opacity: number;
  /** When true, applies color invert filter (black ↔ white) */
  invert?: boolean;
}

// ── Canvas dimensions (matches Swift notebook 725×1000 with ratio 0.725) ──
export const EDITOR_CANVAS_WIDTH = 392;
export const EDITOR_CANVAS_HEIGHT = 540;

// ── Border radius matching real notebook (16pt at 725 width = 2.2% of width) ──
export const EDITOR_CORNER_RADIUS = 9;

// ── Physical reference (for documentation) ──
export const PHYSICAL_PAGE_WIDTH = 725;
export const PHYSICAL_PAGE_HEIGHT = 1000;
export const PHYSICAL_CORNER_RADIUS = 16;

export const DEFAULT_COVER_CONFIG: CoverConfigData = {
  version: 1,
  canvas: { width: EDITOR_CANVAS_WIDTH, height: EDITOR_CANVAS_HEIGHT },
  cover: {
    backgroundColor: '#1a1a1a',
    assets: [],
  },
  pageWatermarks: [],
};

export const PRESET_COVER_COLORS = [
  '#1a1a1a', '#2c2c2e', '#f5f5f0', '#e8dcc4',
  '#8b1a1a', '#1a4d3a', '#1e3a5f', '#4a2d5f',
  '#4a7a8c', '#2d4a1a', '#5f2d2d', '#f5c4a8',
];
