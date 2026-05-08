'use client';

import { useState } from 'react';
import { EDITOR_CANVAS_HEIGHT, EDITOR_CANVAS_WIDTH, EDITOR_CORNER_RADIUS } from '@/types/cover';
import type { CoverAssetRef } from '@/types/cover';

/**
 * DesignThumbnail — full-fidelity HTML/CSS preview of a saved design.
 *
 * v39 rewrite. Goals:
 *
 * 1. Render every saved cover asset and every page watermark with
 *    correct position / scale / rotation / opacity / inversion.
 * 2. Match the editor's spatial conventions: cover panel uses the
 *    saved background colour and image; page panel uses an off-white
 *    paper with a dots pattern (the iOS default).
 * 3. Be responsive: the wrapper is fluid, panels share the available
 *    width via flex, each panel keeps the notebook aspect ratio.
 *    No fixed pixel widths → no overflow on narrow viewports.
 * 4. Make cover and page visually distinct: gap, individual shadows,
 *    and the page's dot pattern make it obvious which is which.
 *
 * About scale: the editor stores `scale` as a multiplier of an
 * image's natural pixel size on a 392-px-wide canvas. To reproduce
 * the same VISUAL proportion at any panel width, we read the image's
 * naturalWidth on load and compute its rendered width as a percentage
 * of the panel. This is why the component is client-side: server-side
 * we don't know the natural pixel size of the asset URL.
 */

// Hard-coded dots pattern (matches paperPresets DOTS preset on
// off-white paper, alpha 0.176 — softened ×0.8 from iOS for a
// less-shouty preview). Pre-encoded so we don't btoa at runtime.
const DOTS_PATTERN_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgdmlld0JveD0iMCAwIDEzIDEzIj48Y2lyY2xlIGN4PSI2LjUiIGN5PSI2LjUiIHI9IjEuMjUiIGZpbGw9InJnYmEoMCwwLDAsMC4xNzYpIi8+PC9zdmc+';
const DOTS_PATTERN_SIZE = 13; // px (matches editor BASE_SPACING)

const PAPER_HEX_DEFAULT = '#FDFBF7';

interface DesignThumbnailProps {
  backgroundColor: string;
  backgroundImageUrl?: string | null;

  /** Full cover-asset list as saved on the design. */
  coverAssets?: CoverAssetRef[];
  /** Full page-watermark list as saved on the design. */
  pageWatermarks?: CoverAssetRef[];

  /** @deprecated Use coverAssets[0] / pageWatermarks[0]. */
  primaryAssetUrl?: string | null;
  /** @deprecated Use pageWatermarks[0]. */
  primaryWatermarkUrl?: string | null;

  /**
   * Layout mode:
   *   - 'cover'  : single cover panel (legacy, kept for completeness)
   *   - 'spread' : cover + page side-by-side (used by the design library)
   */
  mode?: 'cover' | 'spread';

  className?: string;
}

export function DesignThumbnail({
  backgroundColor,
  backgroundImageUrl,
  coverAssets,
  pageWatermarks,
  primaryAssetUrl,
  primaryWatermarkUrl,
  mode = 'cover',
  className,
}: DesignThumbnailProps) {
  const cover: CoverAssetRef[] =
    coverAssets ??
    (primaryAssetUrl
      ? [
          {
            name: '',
            url: primaryAssetUrl,
            x: 0.5,
            y: 0.5,
            scale: 0.5,
            rotation: 0,
            opacity: 1,
          },
        ]
      : []);

  const watermarks: CoverAssetRef[] =
    pageWatermarks ??
    (primaryWatermarkUrl
      ? [
          {
            name: '',
            url: primaryWatermarkUrl,
            x: 0.5,
            y: 0.5,
            scale: 0.4,
            rotation: 0,
            opacity: 0.55,
          },
        ]
      : []);

  if (mode === 'spread') {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          gap: '4%',
          width: '100%',
          padding: 12,
          borderRadius: 14,
          background: 'var(--surface-faint)',
          border: '1px solid var(--border-subtle)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <CoverPanel
            backgroundColor={backgroundColor}
            backgroundImageUrl={backgroundImageUrl}
            assets={cover}
            radius={EDITOR_CORNER_RADIUS}
          />
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <PagePanel watermarks={watermarks} radius={EDITOR_CORNER_RADIUS} />
        </div>
      </div>
    );
  }

  // mode === 'cover'
  return (
    <div className={className} style={{ width: '100%' }}>
      <CoverPanel
        backgroundColor={backgroundColor}
        backgroundImageUrl={backgroundImageUrl}
        assets={cover}
        radius={EDITOR_CORNER_RADIUS}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Cover panel
// ───────────────────────────────────────────────────────────────────

function CoverPanel({
  backgroundColor,
  backgroundImageUrl,
  assets,
  radius,
}: {
  backgroundColor: string;
  backgroundImageUrl?: string | null;
  assets: CoverAssetRef[];
  radius: number;
}) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: `${EDITOR_CANVAS_WIDTH} / ${EDITOR_CANVAS_HEIGHT}`,
        backgroundColor,
        backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: radius,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18), 0 1px 3px rgba(0, 0, 0, 0.08)',
      }}
    >
      {assets.map((a, i) => (
        <PositionedAsset key={i} asset={a} />
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Page panel — off-white paper with dots
// ───────────────────────────────────────────────────────────────────

function PagePanel({
  watermarks,
  radius,
}: {
  watermarks: CoverAssetRef[];
  radius: number;
}) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: `${EDITOR_CANVAS_WIDTH} / ${EDITOR_CANVAS_HEIGHT}`,
        backgroundColor: PAPER_HEX_DEFAULT,
        backgroundImage: `url("${DOTS_PATTERN_URL}")`,
        backgroundSize: `${DOTS_PATTERN_SIZE}px ${DOTS_PATTERN_SIZE}px`,
        backgroundRepeat: 'repeat',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: radius,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.10), 0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      {watermarks.map((a, i) => (
        <PositionedAsset key={i} asset={a} />
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// PositionedAsset — renders a single image with full editor fidelity
// ───────────────────────────────────────────────────────────────────
//
// The editor stores `scale` as a multiplier of natural pixel size on
// a 392-px-wide canvas. To reproduce the same VISUAL size on a panel
// of any width, we need to know the image's naturalWidth. We learn
// it on the load event and store it in state, then express the
// rendered width as a percentage of the panel:
//
//   widthPctOfPanel = (naturalWidth * scale) / 392 * 100
//
// Before the image loads, we render at maxWidth: scale * 100% as a
// reasonable approximation that doesn't cause layout flash for most
// logos (which tend to fit cover at scale ~0.3–0.6).
//
// Position uses left/top + translate(-50%, -50%) so (x, y) refer to
// the asset's CENTER (matches Fabric's originX/originY = 'center').
//
// Rotation is applied around center after the translate.
//
// Invert uses CSS filter: invert(1) — same approach as the editor's
// layout-template thumbnails (which always rendered correctly).

function PositionedAsset({ asset }: { asset: CoverAssetRef }) {
  const url = asset.url ?? asset.dataUrl;
  const [naturalW, setNaturalW] = useState<number | null>(null);

  if (!url) return null;

  // True width-of-panel percentage once we know the natural pixel size.
  // Before then, fall back to a reasonable approximation that stays
  // clamped under 100% so it never overflows.
  const widthPct =
    naturalW !== null
      ? Math.min(150, (naturalW * asset.scale) / EDITOR_CANVAS_WIDTH * 100)
      : Math.min(80, asset.scale * 100);

  return (
    <img
      src={url}
      alt=""
      draggable={false}
      onLoad={(e) => {
        const w = (e.currentTarget as HTMLImageElement).naturalWidth;
        if (w && w !== naturalW) setNaturalW(w);
      }}
      style={{
        position: 'absolute',
        left: `${asset.x * 100}%`,
        top: `${asset.y * 100}%`,
        width: `${widthPct}%`,
        height: 'auto',
        transform: `translate(-50%, -50%) rotate(${asset.rotation}deg)`,
        transformOrigin: 'center center',
        opacity: asset.opacity,
        filter: asset.invert ? 'invert(1)' : undefined,
        pointerEvents: 'none',
      }}
    />
  );
}
