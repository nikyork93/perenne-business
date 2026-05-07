import { EDITOR_CANVAS_HEIGHT, EDITOR_CANVAS_WIDTH } from '@/types/cover';
import { isPaperDark } from '@/components/editor/paperPresets';

/**
 * DesignThumbnail — pure HTML/CSS preview of a design.
 *
 * Two modes:
 *   - 'cover' (default): single panel showing background + primary cover logo
 *   - 'spread'         : two panels side-by-side — cover on left, page on
 *                        right (off-white iOS paper colour, with the primary
 *                        watermark overlaid). Used in the library card so
 *                        the user gets an at-a-glance overview of both
 *                        sides of the design without opening the editor.
 *
 * No Fabric, no canvas. Same approach as the LayoutTemplate thumbnails
 * inside CoverEditor — div + child <img> positioned via CSS transform.
 */
interface DesignThumbnailProps {
  backgroundColor: string;
  backgroundImageUrl?: string | null;
  primaryAssetUrl?: string | null;
  /** Primary page watermark — first item from pageWatermarksJson */
  primaryWatermarkUrl?: string | null;
  /**
   * Layout mode:
   *   - 'cover'  : single panel (legacy behaviour)
   *   - 'spread' : cover panel + page panel side-by-side, with a
   *                hairline gap simulating the spine
   */
  mode?: 'cover' | 'spread';
  /** Width of EACH panel in pixels. Height computed from canvas ratio. */
  width?: number;
  className?: string;
}

export function DesignThumbnail({
  backgroundColor,
  backgroundImageUrl,
  primaryAssetUrl,
  primaryWatermarkUrl,
  mode = 'cover',
  width = 200,
  className,
}: DesignThumbnailProps) {
  const ratio = EDITOR_CANVAS_HEIGHT / EDITOR_CANVAS_WIDTH;
  const height = Math.round(width * ratio);

  // First iOS paper colour for the page panel preview. Local-only —
  // page colour is editor-state, not part of the saved design.
  const PAPER_HEX = '#FDFBF7';
  const watermarkInverted = isPaperDark(PAPER_HEX); // false for off-white

  function PagePanel({ borderRadius }: { borderRadius: string }) {
    return (
      <div
        style={{
          width,
          height,
          backgroundColor: PAPER_HEX,
          position: 'relative',
          overflow: 'hidden',
          borderRadius,
          flexShrink: 0,
        }}
      >
        {primaryWatermarkUrl && (
          <img
            src={primaryWatermarkUrl}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              maxWidth: width * 0.4,
              maxHeight: height * 0.4,
              width: 'auto',
              height: 'auto',
              transform: 'translate(-50%, -50%)',
              opacity: 0.55,
              filter: watermarkInverted ? 'invert(1)' : undefined,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    );
  }

  function CoverPanel({ borderRadius }: { borderRadius: string }) {
    return (
      <div
        style={{
          width,
          height,
          backgroundColor,
          backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative',
          overflow: 'hidden',
          borderRadius,
          flexShrink: 0,
        }}
      >
        {primaryAssetUrl && (
          <img
            src={primaryAssetUrl}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              maxWidth: width * 0.5,
              maxHeight: height * 0.5,
              width: 'auto',
              height: 'auto',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    );
  }

  if (mode === 'spread') {
    // v35: more polished spread — light frame, subtle shadow, tiny gap
    // simulating the spine. Slight scale on the cover so the asymmetry
    // (cover being the primary surface) reads at a glance.
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          gap: 2,
          padding: 8,
          borderRadius: 12,
          background: 'var(--surface-faint)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        }}
      >
        <CoverPanel borderRadius="4px 0 0 4px" />
        <PagePanel borderRadius="0 4px 4px 0" />
      </div>
    );
  }

  return (
    <div className={className}>
      <CoverPanel borderRadius="8px" />
    </div>
  );
}
