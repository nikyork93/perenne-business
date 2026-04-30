/**
 * snapGuides.ts — v21
 *
 * Two unrelated-but-co-located helpers that the cover & page editors share.
 *
 *   1. attachSnapGuides(canvas, opts)
 *      Canva/Instagram-style snap-while-dragging. Snap targets are the
 *      canvas H/V centerlines and the four "10% margin" lines. While a
 *      drag is in progress and the moving object's *center* (origin
 *      'center' for our images) lands within `threshold` px of any
 *      target, the object is hard-snapped to that target and a dashed
 *      magenta guide line is painted across the canvas. Guides are
 *      cleared on `mouse:up` and `object:modified`.
 *
 *      The guides are painted on Fabric's upper canvas (`contextTop`)
 *      via the `after:render` hook. Fabric does not draw anything else
 *      on contextTop in our setup (canvas.selection = false → no
 *      marquee, no IText cursor), so we own that surface during a drag.
 *      contextTop is cleared on every render before we draw, which
 *      prevents accumulation across animation frames.
 *
 *      Returns a detach() function. Call it before disposing the
 *      canvas to remove listeners and clear the overlay.
 *
 *   2. makeFillColorFilter(fabricLib, hex)
 *      A custom Fabric.Image filter that replaces every non-transparent
 *      pixel's RGB with the given color while preserving its original
 *      alpha. Used by the "Invert color" toggle to turn a dark logo
 *      into a *clean white* logo — the stock fabric.Image.filters.Invert
 *      flips RGB channel values, which leaves anti-aliased edges as
 *      mid-grey (1 - originalGrey ≠ pure white). FillColor avoids that
 *      by writing a flat target color, so anti-aliased edges remain
 *      anti-aliased and the same target color, just at lower alpha.
 *
 *      Defines both a WebGL fragment shader (fast path, used when the
 *      canvas has WebGL filtering enabled) and a 2D fallback.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Snap guides ─────────────────────────────────────────────────────

export interface SnapGuideOptions {
  /** Snap distance in canvas pixels. Default 6. */
  threshold?: number;
  /** Margin lines as a fraction of width/height (e.g. 0.10 → 10%/90%). Default 0.10. */
  margin?: number;
  /** Stroke color of the guide lines. Default magenta '#ff3da5'. */
  color?: string;
}

interface ActiveGuides {
  v: number[]; // x positions of vertical guide lines
  h: number[]; // y positions of horizontal guide lines
}

/**
 * Attach snap-while-dragging behavior + visible guides to a Fabric canvas.
 * Returns a detach function for cleanup.
 */
export function attachSnapGuides(
  canvas: any,
  opts: SnapGuideOptions = {}
): () => void {
  const threshold = opts.threshold ?? 6;
  const margin = opts.margin ?? 0.1;
  const color = opts.color ?? '#ff3da5';

  const w = canvas.getWidth();
  const h = canvas.getHeight();

  // Snap targets — vertical lines (constant X), horizontal lines (constant Y).
  const vTargets = [w / 2, w * margin, w * (1 - margin)];
  const hTargets = [h / 2, h * margin, h * (1 - margin)];

  let active: ActiveGuides = { v: [], h: [] };

  function pickClosest(value: number, targets: number[]): number | null {
    let best: number | null = null;
    let bestDist = threshold;
    for (const t of targets) {
      const d = Math.abs(value - t);
      // strict `<` so we never re-snap the obj is already exactly at the target
      // (cleaner UX during very slow drags)
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  function onMoving(e: any) {
    const obj = e?.target;
    if (!obj) return;

    // Our editor images use originX/originY = 'center', so left/top ARE the
    // visual center. If a future editor changes that, this still works for
    // any object whose left/top happens to be the snap reference — but the
    // visual snap point will follow whatever the object's origin says.
    const cx = obj.left;
    const cy = obj.top;

    const next: ActiveGuides = { v: [], h: [] };

    const snappedX = pickClosest(cx, vTargets);
    if (snappedX !== null) {
      obj.set('left', snappedX);
      next.v.push(snappedX);
    }
    const snappedY = pickClosest(cy, hTargets);
    if (snappedY !== null) {
      obj.set('top', snappedY);
      next.h.push(snappedY);
    }

    active = next;
  }

  function drawGuides() {
    const ctx = canvas.contextTop;
    if (!ctx) return;
    // Always clear first — Fabric does NOT clear contextTop on every render
    // (only when contextTopDirty is set). Without this, lines from the
    // previous frame would compound during a drag.
    canvas.clearContext(ctx);
    if (active.v.length === 0 && active.h.length === 0) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (const x of active.v) {
      // Half-pixel offset for crisp 1px strokes on most DPRs.
      const xx = Math.round(x) + 0.5;
      ctx.moveTo(xx, 0);
      ctx.lineTo(xx, h);
    }
    for (const y of active.h) {
      const yy = Math.round(y) + 0.5;
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function clearAll() {
    active = { v: [], h: [] };
    // Trigger one final render so after:render → drawGuides runs once with
    // empty `active` and wipes contextTop.
    canvas.requestRenderAll();
  }

  canvas.on('object:moving', onMoving);
  canvas.on('after:render', drawGuides);
  canvas.on('mouse:up', clearAll);
  canvas.on('object:modified', clearAll);

  return function detach() {
    canvas.off('object:moving', onMoving);
    canvas.off('after:render', drawGuides);
    canvas.off('mouse:up', clearAll);
    canvas.off('object:modified', clearAll);
    active = { v: [], h: [] };
    if (canvas.contextTop) canvas.clearContext(canvas.contextTop);
  };
}

// ─── Fill-color filter ───────────────────────────────────────────────

/**
 * Build a Fabric image filter that re-paints every non-transparent pixel
 * with the given hex color, preserving the original alpha.
 *
 * Implemented by delegating to Fabric's built-in `BlendColor` filter in
 * 'tint' mode with alpha=1. The math (from Fabric's BlendColor source):
 *   out.rgb = source.rgb * alpha + image.rgb * (1 - alpha)
 * With alpha=1 this collapses to `out.rgb = source.rgb` for every pixel,
 * with the image alpha preserved as-is — exactly the behaviour we want
 * for "invert to pure white" without grey anti-alias edges.
 *
 * Why not a custom filter: an earlier revision rolled its own filter
 * via `fabric.util.createClass(filters.BaseFilter, …)` with a custom
 * fragment shader. That kept failing silently in production builds —
 * suspected cause is that the WebGL backend caches compiled shaders by
 * `type` string and a custom non-registered filter doesn't always get a
 * working program. Using a built-in is dependency-free.
 *
 * Usage:
 *   img.filters = [makeFillColorFilter(fabricLib, '#ffffff')];
 *   img.applyFilters();
 *   canvas.renderAll();
 */
export function makeFillColorFilter(fabricLib: any, hex: string): any {
  const Filters = fabricLib?.Image?.filters;
  if (!Filters?.BlendColor) {
    // eslint-disable-next-line no-console
    console.warn('[makeFillColorFilter] Fabric BlendColor not available');
    return null;
  }
  return new Filters.BlendColor({
    color: hex,
    mode: 'tint',
    alpha: 1,
  });
}
