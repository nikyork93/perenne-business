/**
 * Cover config — serialized shape stored in DB and consumed by iOS.
 * Coordinates are normalized 0-1 so they render at any resolution.
 */
export interface CoverConfigData {
  version: number;
  canvas: { width: number; height: number };
  cover: {
    backgroundColor: string;
    assets: CoverAssetRef[];
    quote?: {
      text: string;
      position: 'top' | 'center' | 'bottom';
      color: string;
    };
  };
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
  /** Scale factor (1.0 = natural pixel size) */
  scale: number;
  /** Rotation in degrees [-180, 180] */
  rotation: number;
  /** Opacity [0-1] */
  opacity: number;
}

export const EDITOR_CANVAS_WIDTH = 380;
export const EDITOR_CANVAS_HEIGHT = 540;

export const DEFAULT_COVER_CONFIG: CoverConfigData = {
  version: 1,
  canvas: { width: EDITOR_CANVAS_WIDTH, height: EDITOR_CANVAS_HEIGHT },
  cover: {
    backgroundColor: '#1a1a1a',
    assets: [],
  },
};

export const PRESET_COVER_COLORS = [
  '#1a1a1a', '#2c2c2e', '#f5f5f0', '#e8dcc4',
  '#8b1a1a', '#1a4d3a', '#1e3a5f', '#4a2d5f',
  '#d4a574', '#2d4a1a', '#5f2d2d', '#f5c4a8',
];
