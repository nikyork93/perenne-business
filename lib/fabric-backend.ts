/**
 * v37 — Fabric.js helpers for backend forcing + canvas tab-visibility recovery.
 *
 * Two distinct problems they solve:
 *
 * 1. INVERT COLOR TRUNCATION
 *    Fabric 5's default WebGL filter backend has a maxTextureSize cap
 *    (default 2048px). Wide logos (e.g. 4096×600 wordmarks) get
 *    silently truncated when filters are applied → live canvas shows
 *    only the leftmost portion. CSS-filtered thumbnails are unaffected.
 *    Fix: switch to Canvas2dFilterBackend (no cap, slightly slower CPU).
 *
 * 2. ASSET LOSS ON TAB VISIBILITY
 *    EditorClient mounts BOTH CoverEditor and PageEditor with
 *    display:none toggling. When an editor is initialised hidden,
 *    or stays hidden during async image loads, the underlying
 *    HTMLImageElement can be evicted by the browser → fabric.Image
 *    keeps its reference but `_element.naturalWidth === 0`. Result:
 *    user sees the asset in the sidebar list but nothing on canvas.
 *    Fix: on visibility return, detect stale elements and reload them.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricLib = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricCanvas = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricImage = any;

export function ensureCanvas2dFilterBackend(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricLib: FabricLib = (window as any).fabric;
  if (!fabricLib) return false;
  if (fabricLib._perenneBackendForced) return true;

  if (typeof fabricLib.Canvas2dFilterBackend === 'function') {
    try {
      fabricLib.filterBackend = new fabricLib.Canvas2dFilterBackend();
      fabricLib._perenneBackendForced = true;
      // eslint-disable-next-line no-console
      console.info('[perenne] Fabric filterBackend → Canvas2dFilterBackend');
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[perenne] failed to set Canvas2dFilterBackend', err);
      return false;
    }
  }
  return false;
}

export interface TrackedAsset {
  url?: string;
  dataUrl?: string;
  fabricObj: FabricImage;
}

interface RecoverOptions {
  canvas: FabricCanvas;
  assets: TrackedAsset[];
  width: number;
  height: number;
  label: string;
}

/**
 * Recover a canvas after its parent went display:none → display:block.
 *
 * Steps:
 *   1. Re-set canvas dimensions
 *   2. calcOffset()
 *   3. For each tracked asset:
 *      a. If detached, re-attach it
 *      b. If image is stale (naturalWidth=0), reload from URL
 *   4. Force every object dirty + setCoords
 *   5. requestRenderAll
 */
export async function recoverCanvasOnVisibility(
  opts: RecoverOptions
): Promise<{ reattached: number; reloaded: number }> {
  const { canvas, assets, width, height, label } = opts;

  if (!canvas) return { reattached: 0, reloaded: 0 };

  try {
    canvas.setDimensions?.({ width, height });
  } catch {
    /* noop */
  }

  canvas.calcOffset?.();

  const present = new Set(canvas.getObjects());
  let reattached = 0;
  let reloaded = 0;
  const reloadPromises: Promise<void>[] = [];

  for (const a of assets) {
    if (!a.fabricObj) continue;

    if (!present.has(a.fabricObj)) {
      canvas.add(a.fabricObj);
      reattached++;
    }

    const el = a.fabricObj._element;
    const isImg =
      el &&
      typeof HTMLImageElement !== 'undefined' &&
      el instanceof HTMLImageElement;
    const isStale = isImg && el.naturalWidth === 0;

    if (isStale) {
      const url = a.url ?? a.dataUrl;
      if (!url) continue;
      reloaded++;
      reloadPromises.push(
        new Promise<void>((resolve) => {
          const fresh = new Image();
          if (url.startsWith('http')) {
            fresh.crossOrigin = 'anonymous';
          }
          fresh.onload = () => {
            try {
              a.fabricObj._element = fresh;
              a.fabricObj._originalElement = fresh;
              a.fabricObj._filterScalingX = 1;
              a.fabricObj._filterScalingY = 1;
              if (
                a.fabricObj.perenneInverted &&
                Array.isArray(a.fabricObj.filters) &&
                a.fabricObj.filters.length > 0
              ) {
                a.fabricObj.applyFilters?.();
              }
              a.fabricObj.dirty = true;
              a.fabricObj.setCoords?.();
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn(`[${label}] failed to swap _element`, err);
            }
            resolve();
          };
          fresh.onerror = () => {
            // eslint-disable-next-line no-console
            console.warn(`[${label}] image reload failed:`, url);
            resolve();
          };
          fresh.src = url;
        })
      );
    }
  }

  if (reloadPromises.length > 0) {
    await Promise.all(reloadPromises);
  }

  canvas.getObjects().forEach((obj: FabricImage) => {
    obj.dirty = true;
    obj.setCoords?.();
  });

  canvas.requestRenderAll?.();

  if (reattached > 0 || reloaded > 0) {
    // eslint-disable-next-line no-console
    console.info(
      `[${label}] visibility recovery: reattached=${reattached} reloaded=${reloaded}`
    );
  }

  return { reattached, reloaded };
}
