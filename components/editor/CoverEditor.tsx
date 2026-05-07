'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { Button, Slider, ColorPicker, Input, SectionLabel, Whisper } from '@/components/ui';
import {
  EDITOR_CANVAS_WIDTH,
  EDITOR_CANVAS_HEIGHT,
  EDITOR_CORNER_RADIUS,
  DEFAULT_COVER_CONFIG,
  type CoverConfigData,
  type CoverAssetRef,
} from '@/types/cover';
import { attachSnapGuides, makeFillColorFilter } from './snapGuides';
import { isPaperDark } from './paperPresets';

// Fabric.js loaded from CDN via <Script>; declare global type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabric: any;
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fabric: any;
  }
}

interface FabricImageLike {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
  /** Natural image width — set by fabric.Image when the source image loads. */
  width?: number;
  /** Natural image height — set by fabric.Image when the source image loads. */
  height?: number;
  perenneAssetId?: number;
  perenneAssetName?: string;
  perenneInverted?: boolean;
  perenneAutoAdapt?: boolean;
  filters?: unknown[];
  applyFilters?: () => void;
  setControlsVisibility?: (visibility: Record<string, boolean>) => void;
  set: (props: Record<string, unknown>) => void;
}

interface AssetEntry {
  id: number;
  name: string;
  dataUrl: string;
  url?: string;
  inverted?: boolean;
  autoAdapt?: boolean;
  fabricObj: FabricImageLike;
}

interface CoverEditorProps {
  initialConfig?: CoverConfigData;
  onSave?: (config: CoverConfigData) => Promise<void> | void;
  onAssetUpload?: (file: File) => Promise<{ url: string } | null>;
  onBackgroundUpload?: (file: File) => Promise<{ url: string } | null>;
  /**
   * Whether this editor is the currently visible tab. Gates window-
   * level side effects (keyboard listener). Defaults to true for
   * backward compat with standalone usage.
   */
  isActive?: boolean;
}

// ─── Layout templates ────────────────────────────────────────────────
//
// Each template describes a SINGLE-LOGO layout — position (normalised
// 0-1 coords), envelope size (max-edge as a fraction of canvas width),
// and rotation. Click a template thumbnail to apply that layout to the
// currently-selected asset (or to the first asset if nothing's
// selected).
//
// `maxEdge` is the bigger of the rendered logo's width or height as a
// fraction of canvas width. We use max-edge instead of width-fraction
// because rotation by 90° swaps visual width and height; with
// max-edge the logo keeps the same visual envelope size regardless
// of orientation.

interface LayoutTemplate {
  name: string;
  layout: {
    /** Center position, normalised 0-1 across the canvas. */
    x: number;
    y: number;
    /** Logo's longest visible side as a fraction of canvas width. */
    maxEdge: number;
    /** Rotation in degrees. */
    angle: number;
  };
}

const LAYOUT_TEMPLATES: ReadonlyArray<LayoutTemplate> = [
  { name: 'Center medium',  layout: { x: 0.50, y: 0.50, maxEdge: 0.40, angle:   0 } },
  { name: 'Center bold',    layout: { x: 0.50, y: 0.50, maxEdge: 0.70, angle:   0 } },
  { name: 'Bottom band',    layout: { x: 0.50, y: 0.85, maxEdge: 0.50, angle:   0 } },
  { name: 'Top corner',     layout: { x: 0.78, y: 0.16, maxEdge: 0.22, angle:   0 } },
  { name: 'Vertical edge',  layout: { x: 0.88, y: 0.50, maxEdge: 0.55, angle:  90 } },
  { name: 'Bottom corner',  layout: { x: 0.18, y: 0.85, maxEdge: 0.22, angle:   0 } },
];

// ─── Template thumbnail ──────────────────────────────────────────────
//
// Renders a tiny preview of the cover with the user's primary logo
// placed at the template's position/size/rotation. Pure HTML/CSS — no
// Fabric, no canvas. The logo is positioned in editor coordinates
// inside an inner div that's CSS-scaled down to thumbnail size, so
// math stays simple ("apply layout" and "render thumbnail" share the
// same coord system).

interface TemplateThumbnailProps {
  layout: LayoutTemplate['layout'];
  bgColor: string;
  bgImageUrl?: string;
  primaryAssetUrl?: string;
  invert?: boolean;
  thumbW?: number;
}

function TemplateThumbnail({
  layout,
  bgColor,
  bgImageUrl,
  primaryAssetUrl,
  invert,
  thumbW = 64,
}: TemplateThumbnailProps) {
  // Preserve canvas aspect ratio (392 × 540 → ~0.725).
  const ratio = EDITOR_CANVAS_HEIGHT / EDITOR_CANVAS_WIDTH;
  const thumbH = Math.round(thumbW * ratio);
  // Logo's longest side in thumbnail pixels.
  const maxEdgePx = thumbW * layout.maxEdge;

  return (
    <div
      style={{
        width: thumbW,
        height: thumbH,
        backgroundColor: bgColor,
        backgroundImage: bgImageUrl ? `url(${bgImageUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 4,
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
            // The img is centred on (left, top) via translate(-50%, -50%).
            // max-width/max-height bound the longest side to maxEdgePx;
            // width/height: auto preserves the natural aspect ratio.
            left: layout.x * thumbW,
            top: layout.y * thumbH,
            maxWidth: maxEdgePx,
            maxHeight: maxEdgePx,
            width: 'auto',
            height: 'auto',
            transform: `translate(-50%, -50%) rotate(${layout.angle}deg)`,
            transformOrigin: 'center center',
            filter: invert ? 'invert(1)' : undefined,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

/**
 * CoverEditor — design the front cover of the notebook.
 *
 * Cover has its own background (solid colour or uploaded image), so unlike
 * PageEditor it does NOT use a paper-preview backdrop.
 *
 * v21 fixes:
 *   1. Fabric tab-switch white-rect — useState initialiser checks
 *      window.fabric so the canvas re-mounts immediately on tab change.
 *   2. Snap guides — center H/V + 10% margins, magenta dashed.
 *   3. Live slider sync — forceSync handler on object:scaling/moving/
 *      rotating/modified, scale slider extended to 1–500%.
 *   4. True-white invert — custom FillColor filter replaces stock Invert.
 */
export function CoverEditor({
  initialConfig,
  onSave,
  onAssetUpload,
  onBackgroundUpload,
  isActive = true,
}: CoverEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricCanvasRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(1);
  const detachSnapRef = useRef<(() => void) | null>(null);

  /**
   * Bug 1 fix — see PageEditor for the full rationale. tl;dr Next.js
   * <Script> dedupes by URL and onLoad does not refire on remount, so
   * a tab switch (Cover → Pages → Cover) leaves fabricReady stuck on
   * `false` without this initialiser.
   */
  const [fabricReady, setFabricReady] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !!(window as any).fabric;
  });

  const [bgColor, setBgColor] = useState(
    initialConfig?.cover.backgroundColor ?? DEFAULT_COVER_CONFIG.cover.backgroundColor
  );
  const [bgImageUrl, setBgImageUrl] = useState<string | undefined>(
    initialConfig?.cover.backgroundImageUrl
  );
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeObj, setActiveObj] = useState<any | null>(null);
  const [selTick, setSelTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);

  // ─── Safety net for fabricReady ────────────────────────────────────
  // Catches the rare race where this component mounts while the Fabric
  // <Script> from a previous mount is still in-flight. Polls briefly
  // and stops itself the moment fabric is available, or after 5s.
  useEffect(() => {
    if (fabricReady) return;
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).fabric) {
      setFabricReady(true);
      return;
    }
    const id = window.setInterval(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).fabric) {
        setFabricReady(true);
        window.clearInterval(id);
      }
    }, 50);
    const timeout = window.setTimeout(() => window.clearInterval(id), 5000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(timeout);
    };
  }, [fabricReady]);

  // ─── Initialize Fabric canvas ──────────────────────────────────────
  useEffect(() => {
    if (!fabricReady || !canvasRef.current || fabricCanvasRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fabricLib = (window as any).fabric;
    if (!fabricLib) return;

    const canvas = new fabricLib.Canvas(canvasRef.current, {
      backgroundColor: bgColor,
      preserveObjectStacking: true,
      selection: false,
    });

    // Selection visuals — teal accent
    fabricLib.Object.prototype.transparentCorners = false;
    fabricLib.Object.prototype.cornerColor = '#4a7a8c';
    fabricLib.Object.prototype.cornerStyle = 'circle';
    fabricLib.Object.prototype.cornerStrokeColor = '#0a0a0f';
    fabricLib.Object.prototype.cornerSize = 10;
    fabricLib.Object.prototype.borderColor = '#4a7a8c';
    fabricLib.Object.prototype.borderScaleFactor = 1.4;
    fabricLib.Object.prototype.rotatingPointOffset = 30;
    fabricLib.Object.prototype.borderDashArray = [4, 4];

    // Bug 3 fix: forceSync — re-read the active object out of Fabric and
    // bump selTick so the selection-properties panel re-renders against
    // the (mutated) object during corner-drag scaling.
    const forceSync = () => {
      const c = fabricCanvasRef.current;
      if (!c) return;
      setActiveObj((prev) => c.getActiveObject() ?? prev);
      setSelTick((t) => t + 1);
    };

    const onSelect = () => {
      setActiveObj(canvas.getActiveObject());
      setSelTick((t) => t + 1);
    };
    canvas.on('selection:created', onSelect);
    canvas.on('selection:updated', onSelect);
    canvas.on('selection:cleared', () => setActiveObj(null));
    canvas.on('object:modified', forceSync);
    canvas.on('object:moving', forceSync);
    canvas.on('object:scaling', forceSync);
    canvas.on('object:rotating', forceSync);

    fabricCanvasRef.current = canvas;

    // Bug 2 fix: snap guides
    detachSnapRef.current = attachSnapGuides(canvas, {
      threshold: 6,
      margin: 0.1,
      color: '#ff3da5',
    });

    // Restore initial bg image if present
    if (initialConfig?.cover.backgroundImageUrl) {
      loadBackgroundImage(initialConfig.cover.backgroundImageUrl);
    }

    // Restore initial assets from DB config
    if (initialConfig?.cover.assets?.length) {
      initialConfig.cover.assets.forEach((a) => {
        if (a.url || a.dataUrl) {
          loadAssetFromUrl(a.url ?? a.dataUrl ?? '', a.name, a);
        }
      });
    }

    return () => {
      detachSnapRef.current?.();
      detachSnapRef.current = null;
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricReady]);

  // ─── Sync bgColor → fabric ─────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.backgroundColor = bgColor;
    canvas.renderAll();
  }, [bgColor]);

  // ─── Background image loader ───────────────────────────────────────
  const loadBackgroundImage = useCallback((url: string) => {
    const canvas = fabricCanvasRef.current;
    const fabricLib = window.fabric;
    if (!canvas || !fabricLib) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fabricLib.Image.fromURL(
      url,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (img: any) => {
        // Cover the canvas while preserving aspect ratio
        const scaleX = EDITOR_CANVAS_WIDTH / (img.width ?? 1);
        const scaleY = EDITOR_CANVAS_HEIGHT / (img.height ?? 1);
        const scale = Math.max(scaleX, scaleY);
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
          scaleX: scale,
          scaleY: scale,
          originX: 'left',
          originY: 'top',
        });
      },
      { crossOrigin: 'anonymous' }
    );
  }, []);

  // ─── Background image upload handler ───────────────────────────────
  async function handleBgFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBgUploading(true);
    try {
      // Immediate preview via data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setBgImageUrl(dataUrl);
      loadBackgroundImage(dataUrl);

      // Persistent upload to R2
      if (onBackgroundUpload) {
        const result = await onBackgroundUpload(file);
        if (result?.url) {
          setBgImageUrl(result.url);
          loadBackgroundImage(result.url);
        }
      }
    } finally {
      setBgUploading(false);
    }
  }

  function clearBackgroundImage() {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.setBackgroundImage(null, canvas.renderAll.bind(canvas));
    setBgImageUrl(undefined);
  }

  // ─── Logo asset loader ─────────────────────────────────────────────
  const loadAssetFromUrl = useCallback(
    (url: string, name: string, restore?: CoverAssetRef) => {
      const canvas = fabricCanvasRef.current;
      const fabricLib = window.fabric;
      if (!canvas || !fabricLib) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fabricLib.Image.fromURL(
        url,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (img: any) => {
          const id = nextIdRef.current++;
          img.perenneAssetId = id;
          img.perenneAssetName = name;
          img.perenneInverted = restore?.invert ?? false;

          if (restore) {
            img.set({
              left: restore.x * EDITOR_CANVAS_WIDTH,
              top: restore.y * EDITOR_CANVAS_HEIGHT,
              originX: 'center',
              originY: 'center',
              scaleX: restore.scale,
              scaleY: restore.scale,
              angle: restore.rotation,
              opacity: restore.opacity,
              // ⭐ Lock proportions — block ALL non-uniform scaling
              lockUniScaling: true,
              lockScalingFlip: true,
            });
          } else {
            const maxEdge = Math.max(img.width ?? 100, img.height ?? 100);
            const scale = (EDITOR_CANVAS_WIDTH * 0.4) / maxEdge;
            img.set({
              left: EDITOR_CANVAS_WIDTH / 2,
              top: EDITOR_CANVAS_HEIGHT / 2,
              originX: 'center',
              originY: 'center',
              scaleX: scale,
              scaleY: scale,
              lockUniScaling: true,
              lockScalingFlip: true,
            });
          }

          // ⭐ Disable middle handles — corners only, uniform scale
          img.setControlsVisibility({
            mt: false,
            mb: false,
            ml: false,
            mr: false,
            mtr: true,
            tl: true,
            tr: true,
            bl: true,
            br: true,
          });

          // v35: defer invert restoration until after the image is on
          // canvas — calls setInvertedState() which uses the manual
          // canvas2d tinting helper (no WebGL truncation).
          if (restore?.invert) {
            // Mark for invert; setInvertedState will lazily build the
            // tinted element. Note: we can't call setInvertedState here
            // because of TDZ — it's defined later in the component.
            // Instead set the flag and re-invert on next tick.
            img.perenneInverted = true;
            queueMicrotask(() => {
              setInvertedState(img, true);
              canvas.requestRenderAll?.();
            });
          }

          canvas.add(img);
          if (!restore) canvas.setActiveObject(img);
          canvas.renderAll();

          setAssets((prev) => [
            ...prev,
            {
              id,
              name,
              dataUrl: url.startsWith('data:') ? url : '',
              url: url.startsWith('http') ? url : undefined,
              inverted: restore?.invert ?? false,
              fabricObj: img,
            },
          ]);
        },
        { crossOrigin: 'anonymous' }
      );
    },
    []
  );

  // ─── Logo upload handler ───────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach(async (file) => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      loadAssetFromUrl(dataUrl, file.name);

      if (onAssetUpload) {
        const result = await onAssetUpload(file);
        if (result?.url) {
          setAssets((prev) =>
            prev.map((a) =>
              a.name === file.name && !a.url ? { ...a, url: result.url } : a
            )
          );
        }
      }
    });
    e.target.value = '';
  }

  // ─── Asset operations ──────────────────────────────────────────────
  function selectAsset(asset: AssetEntry) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.setActiveObject(asset.fabricObj);
    canvas.renderAll();
  }

  function removeAsset(id: number) {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    setAssets((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) canvas.remove(target.fabricObj);
      canvas.renderAll();
      return prev.filter((a) => a.id !== id);
    });
  }

  // ─── Filter helpers (v35 — manual canvas inversion) ──────────────
  //
  // Why manual: Fabric 5's BlendColor filter routes through a WebGL
  // backend with a default maxTextureSize of 2048. When an inverted
  // logo's *original* image width exceeds that (e.g. a 4096×600 wide
  // wordmark), the filter pipeline silently downscales+crops the
  // result, so on the canvas the user sees only the leftmost ~2048px
  // worth of the logo. Setting objectCaching=false didn't help because
  // the truncation happens inside applyFilters() before caching.
  //
  // Solution: do the tint manually on a canvas2d offscreen buffer at
  // the original image's natural dimensions. This bypasses WebGL
  // entirely. For our use case (preserving alpha, recoloring all
  // non-transparent pixels white) the math is trivial:
  //
  //   for each pixel: if alpha > 0 → set rgb to (255,255,255)
  //
  // We cache the inverted canvas on the fabric image so toggling
  // doesn't re-process every time.
  function buildInvertedElement(orig: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
    const w = (orig as HTMLImageElement).naturalWidth || orig.width;
    const h = (orig as HTMLImageElement).naturalHeight || orig.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return out;
    ctx.drawImage(orig as CanvasImageSource, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 0) {
        px[i] = 255;
        px[i + 1] = 255;
        px[i + 2] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
    return out;
  }

  function setInvertedState(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    img: any,
    inverted: boolean
  ) {
    img.perenneInverted = inverted;
    // Clear filters — we do the work manually now
    img.filters = [];

    // Lazy-build (and cache) the inverted canvas on first invert
    if (inverted) {
      if (!img._perenneInvertedEl) {
        const orig = img._originalElement;
        if (orig) {
          img._perenneInvertedEl = buildInvertedElement(orig);
        }
      }
      if (img._perenneInvertedEl) {
        img._element = img._perenneInvertedEl;
      }
    } else if (img._originalElement) {
      img._element = img._originalElement;
    }

    // Force re-render
    img.dirty = true;
    img.objectCaching = false;
    img.statefullCache = false;
    img.cacheKey = `${img.perenneAssetId ?? 'x'}_${inverted ? 'inv' : 'orig'}_${Date.now()}`;
    img.setCoords?.();
  }

  // Manual invert toggle. Mutually exclusive with auto-adapt — clicking
  // here always exits auto-adapt mode and takes manual control.
  function toggleInvert() {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObj) return;

    const newInverted = !activeObj.perenneInverted;
    activeObj.perenneAutoAdapt = false;
    setInvertedState(activeObj, newInverted);
    canvas.renderAll();

    setAssets((prev) =>
      prev.map((a) =>
        a.id === activeObj.perenneAssetId
          ? { ...a, inverted: newInverted, autoAdapt: false }
          : a
      )
    );
    setSelTick((t) => t + 1);
  }

  // Auto-adapt toggle. When enabling, immediately compute the correct
  // inverted state from the current cover background colour and apply
  // it. Future changes to bgColor are picked up by the useEffect below.
  // When disabling, keep the last-applied inverted state — user can
  // then toggle Invert manually from there.
  function toggleAutoAdapt() {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObj) return;

    const newAuto = !activeObj.perenneAutoAdapt;
    activeObj.perenneAutoAdapt = newAuto;

    let nextInverted = activeObj.perenneInverted ?? false;
    if (newAuto) {
      nextInverted = isPaperDark(bgColor);
      setInvertedState(activeObj, nextInverted);
    }
    canvas.renderAll();

    setAssets((prev) =>
      prev.map((a) =>
        a.id === activeObj.perenneAssetId
          ? { ...a, autoAdapt: newAuto, inverted: nextInverted }
          : a
      )
    );
    setSelTick((t) => t + 1);
  }

  // When the cover background colour changes, walk every asset that has
  // auto-adapt enabled and re-apply the matching inverted state.
  // Bg image is intentionally NOT analysed — too unreliable to compute
  // an accurate luminance from arbitrary uploaded images. Document this
  // in the UI hint so the user knows to take manual control with bg
  // images.
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const targetInverted = isPaperDark(bgColor);
    let mutated = false;

    assets.forEach((a) => {
      if (!a.autoAdapt) return;
      if ((a.fabricObj.perenneInverted ?? false) === targetInverted) return;
      setInvertedState(a.fabricObj, targetInverted);
      mutated = true;
    });

    if (mutated) {
      canvas.renderAll();
      // Mirror new inverted flags into React state so the right-panel
      // controls show the correct active state for the active asset.
      setAssets((prev) =>
        prev.map((a) =>
          a.autoAdapt ? { ...a, inverted: targetInverted } : a
        )
      );
      setSelTick((t) => t + 1);
    }
    // assets is intentionally excluded — we read it via the closure but
    // we don't want to re-run on every assets change (which would loop
    // forever since this very effect mutates assets via setAssets).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgColor]);

  // ─── Property editors ──────────────────────────────────────────────
  function updateActive(patch: Record<string, number>) {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObj) return;
    activeObj.set(patch);
    activeObj.setCoords?.();
    // requestRenderAll (RAF-coalesced) instead of renderAll. See
    // PageEditor for the rationale — slider drags need RAF-scheduled
    // renders to be reliably visible during drag.
    canvas.requestRenderAll();
    setSelTick((t) => t + 1);
  }

  // ─── Layout templates ──────────────────────────────────────────────
  // Apply a LayoutTemplate to the active asset (or to the first asset
  // if nothing's selected). The fabric scale is computed from the
  // logo's natural longest edge so that rotated and non-rotated
  // templates give the same visual envelope size.
  function applyLayoutTemplate(tpl: LayoutTemplate) {
    if (assets.length === 0) {
      alert('Upload at least one logo first.');
      return;
    }
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const target = activeObj ?? assets[0].fabricObj;
    const naturalMax = Math.max(target.width ?? 100, target.height ?? 100);
    const targetMaxPx = EDITOR_CANVAS_WIDTH * tpl.layout.maxEdge;
    const scale = targetMaxPx / naturalMax;

    target.set({
      left: tpl.layout.x * EDITOR_CANVAS_WIDTH,
      top: tpl.layout.y * EDITOR_CANVAS_HEIGHT,
      scaleX: scale,
      scaleY: scale,
      angle: tpl.layout.angle,
    });
    target.setCoords?.();
    canvas.setActiveObject(target);
    canvas.renderAll();
    setSelTick((t) => t + 1);
  }

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  // Gated by `isActive` so the listener is only attached when this
  // editor is the currently-visible tab — see PageEditor for the same
  // pattern and rationale.
  useEffect(() => {
    if (!isActive) return;
    function handleKey(e: KeyboardEvent) {
      if (!activeObj) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft')  { updateActive({ left: activeObj.left - step }); e.preventDefault(); }
      if (e.key === 'ArrowRight') { updateActive({ left: activeObj.left + step }); e.preventDefault(); }
      if (e.key === 'ArrowUp')    { updateActive({ top:  activeObj.top  - step }); e.preventDefault(); }
      if (e.key === 'ArrowDown')  { updateActive({ top:  activeObj.top  + step }); e.preventDefault(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeObj.perenneAssetId != null) removeAsset(activeObj.perenneAssetId);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeObj, isActive]);

  // ─── Serialize to config ───────────────────────────────────────────
  function buildConfig(): CoverConfigData {
    return {
      version: 1,
      canvas: { width: EDITOR_CANVAS_WIDTH, height: EDITOR_CANVAS_HEIGHT },
      cover: {
        backgroundColor: bgColor,
        backgroundImageUrl: bgImageUrl?.startsWith('http') ? bgImageUrl : undefined,
        assets: assets.map((a) => ({
          name: a.name,
          url: a.url,
          x: +(a.fabricObj.left / EDITOR_CANVAS_WIDTH).toFixed(4),
          y: +(a.fabricObj.top / EDITOR_CANVAS_HEIGHT).toFixed(4),
          scale: +a.fabricObj.scaleX.toFixed(4),
          rotation: +(a.fabricObj.angle || 0).toFixed(2),
          opacity: +(a.fabricObj.opacity ?? 1).toFixed(2),
          invert: a.inverted || undefined,
        })),
      },
    };
  }

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(buildConfig());
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    const str = JSON.stringify(buildConfig(), null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cover-config.json';
    a.click();
  }

  function handleReset() {
    if (!confirm('Remove all assets and reset cover?')) return;
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      assets.forEach((a) => canvas.remove(a.fabricObj));
      canvas.setBackgroundImage(null, canvas.renderAll.bind(canvas));
      canvas.renderAll();
    }
    setAssets([]);
    setBgImageUrl(undefined);
    setBgColor('#1a1a1a');
  }

  // ─── Display values ────────────────────────────────────────────────
  const activeValues = activeObj
    ? {
        posX: Math.round(activeObj.left),
        posY: Math.round(activeObj.top),
        nx: (activeObj.left / EDITOR_CANVAS_WIDTH).toFixed(3),
        ny: (activeObj.top / EDITOR_CANVAS_HEIGHT).toFixed(3),
        scalePct: Math.round(activeObj.scaleX * 100),
        rotation: Math.round(activeObj.angle || 0),
        opacityPct: Math.round((activeObj.opacity ?? 1) * 100),
        name: activeObj.perenneAssetName || 'Object',
        inverted: activeObj.perenneInverted ?? false,
        autoAdapt: activeObj.perenneAutoAdapt ?? false,
      }
    : null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = selTick;

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js"
        strategy="afterInteractive"
        onLoad={() => setFabricReady(true)}
      />

      <div className="grid grid-cols-[260px_1fr_300px] gap-3.5 h-[calc(100vh-200px)]">
        {/* ── LEFT PANEL ────────────────────────────────────────── */}
        <aside className="glass p-5 flex flex-col gap-6 overflow-y-auto">
          <div>
            <SectionLabel>Logos & Assets</SectionLabel>
            <Button variant="upload" onClick={() => fileInputRef.current?.click()}>
              <span className="text-base leading-none">+</span>
              <span>Upload logo or image</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="mt-3 flex flex-col gap-1.5">
              {assets.length === 0 && (
                <Whisper className="py-4">No assets yet. Upload a logo to start.</Whisper>
              )}
              {assets.map((a) => {
                const isAssetActive = activeObj?.perenneAssetId === a.id;
                return (
                  <div
                    key={a.id}
                    onClick={() => selectAsset(a)}
                    className={`group flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition ${
                      isAssetActive
                        ? 'bg-accent/10 border-accent/40'
                        : 'bg-surface-faint border-border-subtle hover:bg-surface-hover hover:border-glass-hairline'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-md bg-surface-faint flex items-center justify-center overflow-hidden shrink-0">
                      <img
                        src={a.url || a.dataUrl}
                        alt=""
                        className="w-full h-full object-contain"
                        style={a.inverted ? { filter: 'invert(1)' } : undefined}
                      />
                    </div>
                    <span className="flex-1 text-xs text-ink-dim truncate">{a.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAsset(a.id);
                      }}
                      className="text-ink-faint hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 text-sm"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <SectionLabel>Layout templates</SectionLabel>
            {assets.length === 0 ? (
              <Whisper className="py-4">
                Upload a logo to see template previews.
              </Whisper>
            ) : (
              <div className="flex flex-col gap-1.5">
                {LAYOUT_TEMPLATES.map((tpl) => {
                  // Pick which logo to render in the thumbnails:
                  //   - the currently-selected one if any,
                  //   - else the first uploaded asset.
                  // Thumbnails update live as the user uploads, swaps
                  // selection, changes bgColor / bgImageUrl / inverts.
                  const primary = activeObj
                    ? assets.find((a) => a.fabricObj === activeObj) ?? assets[0]
                    : assets[0];
                  const primaryUrl = primary?.url || primary?.dataUrl;
                  return (
                    <button
                      key={tpl.name}
                      type="button"
                      onClick={() => applyLayoutTemplate(tpl)}
                      title={tpl.name}
                      className="flex items-center gap-3 p-2 rounded-lg border border-glass-border bg-surface-faint hover:bg-surface-hover hover:border-glass-hairline transition group text-left"
                    >
                      <TemplateThumbnail
                        layout={tpl.layout}
                        bgColor={bgColor}
                        bgImageUrl={bgImageUrl}
                        primaryAssetUrl={primaryUrl}
                        invert={primary?.inverted}
                        thumbW={64}
                      />
                      <span className="flex-1 text-xs text-ink-dim group-hover:text-ink font-mono">
                        {tpl.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ── CENTER: Canvas ────────────────────────────────────── */}
        <main className="glass flex items-center justify-center relative overflow-hidden">
          <div
            className="overflow-hidden"
            style={{
              borderRadius: `${EDITOR_CORNER_RADIUS}px`,
              filter:
                'drop-shadow(0 60px 120px rgba(0,0,0,0.5)) drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
              boxShadow:
                'inset 0 0 0 1px rgba(0,0,0,0.4), inset 2px 0 0 0 rgba(255,255,255,0.05), inset -1px 0 0 0 rgba(0,0,0,0.2)',
            }}
          >
            <canvas
              ref={canvasRef}
              width={EDITOR_CANVAS_WIDTH}
              height={EDITOR_CANVAS_HEIGHT}
            />
          </div>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.1em] text-white/85 py-1.5 px-3.5 bg-black/55 backdrop-blur border border-white/10 rounded-full whitespace-nowrap">
            {EDITOR_CANVAS_WIDTH}×{EDITOR_CANVAS_HEIGHT} · ratio 0.725 · radius {EDITOR_CORNER_RADIUS}px
          </div>
        </main>

        {/* ── RIGHT PANEL: Background + Selection ───────────────── */}
        <aside className="glass p-5 flex flex-col gap-6 overflow-y-auto">
          {/* Background section */}
          <div>
            <SectionLabel>Cover background</SectionLabel>

            {/* Background image upload */}
            <div className="mb-4">
              {bgImageUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 p-2 rounded-lg border border-glass-border bg-surface-faint">
                    <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-surface-faint">
                      <img
                        src={bgImageUrl}
                        alt="background"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="flex-1 text-[11px] text-ink-dim">Pattern image</span>
                    <button
                      type="button"
                      onClick={clearBackgroundImage}
                      className="text-ink-faint hover:text-danger px-1.5 py-0.5 text-sm"
                      aria-label="Remove background"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="upload"
                  onClick={() => bgFileInputRef.current?.click()}
                  loading={bgUploading}
                >
                  <span className="text-base leading-none">+</span>
                  <span>Upload pattern / image</span>
                </Button>
              )}
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBgFileChange}
              />
            </div>

            {/* Background color (always visible — used as fallback if no image) */}
            <ColorPicker
              label={bgImageUrl ? 'Fallback color' : 'Color'}
              value={bgColor}
              onChange={setBgColor}
            />
          </div>

          {/* Selection section */}
          <div>
            <SectionLabel>Selection</SectionLabel>
            {!activeValues ? (
              <Whisper className="py-5">
                Select an object on the canvas to edit its properties.
              </Whisper>
            ) : (
              <div className="space-y-4">
                <div className="py-2.5 px-3 bg-accent/10 border border-accent/20 rounded-lg text-[11px] text-accent font-mono">
                  {activeValues.name}
                </div>

                <div>
                  <div className="label mb-2 flex justify-between">
                    <span>Position</span>
                    <span className="font-mono text-[10px] text-ink-dim normal-case tracking-normal">
                      {activeValues.nx}, {activeValues.ny}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      mono
                      type="number"
                      value={activeValues.posX}
                      onChange={(e) => updateActive({ left: Number(e.target.value) })}
                    />
                    <Input
                      mono
                      type="number"
                      value={activeValues.posY}
                      onChange={(e) => updateActive({ top: Number(e.target.value) })}
                    />
                  </div>
                </div>

                {/* Bug 3 fix: range extended 1–500% */}
                <Slider
                  label="Scale"
                  displayValue={`${activeValues.scalePct}%`}
                  min={1}
                  max={500}
                  value={activeValues.scalePct}
                  onInput={(e) => {
                    const s = Number((e.target as HTMLInputElement).value) / 100;
                    updateActive({ scaleX: s, scaleY: s });
                  }}
                />
                <Slider
                  label="Rotation"
                  displayValue={`${activeValues.rotation}°`}
                  min={-180}
                  max={180}
                  value={activeValues.rotation}
                  onInput={(e) =>
                    updateActive({ angle: Number((e.target as HTMLInputElement).value) })
                  }
                />
                <Slider
                  label="Opacity"
                  displayValue={`${activeValues.opacityPct}%`}
                  min={0}
                  max={100}
                  value={activeValues.opacityPct}
                  onInput={(e) =>
                    updateActive({
                      opacity: Number((e.target as HTMLInputElement).value) / 100,
                    })
                  }
                />

                {/* B↔W controls — manual Invert + Auto-adapt are mutually
                    exclusive: clicking either takes priority and switches the
                    other off. The visible "active" highlight always reflects
                    the *currently dominant* mode. */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={toggleInvert}
                    className={`btn !w-full !justify-center transition ${
                      activeValues.inverted && !activeValues.autoAdapt
                        ? 'bg-accent/15 border-accent/40 text-accent'
                        : ''
                    }`}
                  >
                    <span>
                      {activeValues.inverted && !activeValues.autoAdapt
                        ? '✓ Inverted'
                        : 'Invert color'}
                    </span>
                    <span className="ml-2 text-[10px] text-ink-faint">B ↔ W</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleAutoAdapt}
                    className={`btn !w-full !justify-center transition ${
                      activeValues.autoAdapt
                        ? 'bg-accent/15 border-accent/40 text-accent'
                        : ''
                    }`}
                    title="Logo turns white on dark cover, original on light cover"
                  >
                    <span>
                      {activeValues.autoAdapt ? '✓ Auto B ↔ W' : 'Auto B ↔ W'}
                    </span>
                    <span className="ml-2 text-[10px] text-ink-faint">follows cover</span>
                  </button>

                  {activeValues.autoAdapt && bgImageUrl && (
                    <p className="text-[9px] text-ink-faint leading-relaxed font-mono">
                      Auto-adapt follows the cover colour. Background images
                      are not analysed — invert manually if needed.
                    </p>
                  )}
                </div>

                <Button
                  variant="danger"
                  block
                  onClick={() => {
                    if (activeObj?.perenneAssetId != null) removeAsset(activeObj.perenneAssetId);
                  }}
                >
                  Delete object
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Bottom toolbar ───────────────────────────────────────── */}
      <div className="flex gap-3 mt-4 justify-end">
        <Button onClick={handleReset}>Reset</Button>
        <Button onClick={handleExport}>Export JSON</Button>
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!onSave}>
          Save Cover
        </Button>
      </div>
    </>
  );
}
