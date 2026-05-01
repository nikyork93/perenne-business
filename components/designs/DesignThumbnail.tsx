import { EDITOR_CANVAS_HEIGHT, EDITOR_CANVAS_WIDTH } from '@/types/cover';

/**
 * DesignThumbnail — pure HTML/CSS preview of a design.
 *
 * Renders the cover background + the primary logo in editor coords,
 * scaled to a thumbnail size. No Fabric, no canvas — same approach as
 * the LayoutTemplate thumbnails inside CoverEditor, just at a bigger
 * size and without click behaviour. Aspect ratio matches the editor
 * canvas so what the user sees on the design card matches what they
 * see in /designs/[id]/edit.
 */
interface DesignThumbnailProps {
  backgroundColor: string;
  backgroundImageUrl?: string | null;
  primaryAssetUrl?: string | null;
  /** Width in pixels. Height is computed from canvas aspect ratio. */
  width?: number;
  className?: string;
}

export function DesignThumbnail({
  backgroundColor,
  backgroundImageUrl,
  primaryAssetUrl,
  width = 200,
  className,
}: DesignThumbnailProps) {
  // Canvas ratio (392 × 540 → ~0.725) — same as the editor canvas
  const ratio = EDITOR_CANVAS_HEIGHT / EDITOR_CANVAS_WIDTH;
  const height = Math.round(width * ratio);

  return (
    <div
      className={className}
      style={{
        width,
        height,
        backgroundColor,
        backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 8,
      }}
    >
      {primaryAssetUrl && (
        <img
          src={primaryAssetUrl}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            // Default placement: center, half the thumb width — gives a
            // sensible hint of the brand even when we don't have full
            // assetsJson with positions. Edit page shows the real layout.
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
