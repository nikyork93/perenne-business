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
import { ensureCanvas2dFilterBackend, recoverCanvasOnVisibility } from '@/lib/fabric-backend';
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

interface LayoutTemplate {
  name: string;
  layout: {
    x: number;
    y: number;
    maxEdge: number;
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
  const ratio = EDITOR_CANVAS_HEIGHT / EDITOR_CANVAS_WIDTH;
  const thumbH = Math.round(thumbW * ratio);
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
  // v40 — track in-flight R2 uploads so Save UI can warn the user
  const [pendingUploads, setPendingUploads] = useState<Set<string>>(() => new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeObj, setActiveObj] = useState<any | null>(null);
  const [selTick, setSelTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  // v41 — track image-load errors so the user sees them in the UI
  const [loadErrors, setLoadErrors] = useState<string[]>([]);

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

  useEffect(() => {
    if (!fabricReady || !canvasRef.current || fabricCanvasRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fabricLib = (window as any).fabric;
    if (!fabricLib) return;

    ensureCanvas2dFilterBackend();

    const canvas = new fabricLib.Canvas(canvasRef.current, {
      backgroundColor: bgColor,
      preserveObjectStacking: true,
      selection: false,
    });

    fabricLib.Object.prototype.transparentCorners = false;
    fabricLib.Object.prototype.cornerColor = '#4a7a8c';
    fabricLib.Object.prototype.cornerStyle = 'circle';
    fabricLib.Object.prototype.cornerStrokeColor = '#0a0a0f';
    fabricLib.Object.prototype.cornerSize = 10;
    fabricLib.Object.prototype.borderColor = '#4a7a8c';
    fabricLib.Object.prototype.borderScaleFactor = 1.4;
    fabricLib.Object.prototype.rotatingPointOffset = 30;
    fabricLib.Object.prototype.borderDashArray = [4, 4];

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

    detachSnapRef.current = attachSnapGuides(canvas, {
      threshold: 6,
      margin: 0.1,
      color: '#ff3da5',
    });

    if (initialConfig?.cover.backgroundImageUrl) {
      loadBackgroundImage(initialConfig.cover.backgroundImageUrl);
    }

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

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.backgroundColor = bgColor;
    canvas.renderAll();
  }, [bgColor]);

  const loadBackgroundImage = useCallback((url: string) => {
    const canvas = fabricCanvasRef.current;
    const fabricLib = window.fabric;
    if (!canvas || !fabricLib) return;

    // v41: bg images don't need CORS (no filters applied), so don't pass crossOrigin
    fabricLib.Image.fromURL(
      url,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (img: any) => {
        if (!img || !img.width) {
          // eslint-disable-next-line no-console
          console.error('[CoverEditor] background image failed to load:', url);
          return;
        }
        const scaleX = EDITOR_CANVAS_WIDTH / (img.width ?? 1);
        const scaleY = EDITOR_CANVAS_HEIGHT / (img.height ?? 1);
        const scale = Math.max(scaleX, scaleY);
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
          scaleX: scale,
          scaleY: scale,
          originX: 'left',
          originY: 'top',
        });
      }
    );
  }, []);

  async function handleBgFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBgUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setBgImageUrl(dataUrl);
      loadBackgroundImage(dataUrl);

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
  // v41 — Robust loader that handles R2 CORS issues. When the URL is
  // an HTTP URL (saved asset), we try crossOrigin:anonymous first
  // (so filters work). If that fails (R2 without CORS), we retry
  // with no crossOrigin so the user at least SEES their asset.
  // Filters won't work on those (canvas tainted) but we surface a
  // visible error so they can fix CORS in R2.
  const loadAssetFromUrl = useCallback(
    (url: string, name: string, restore?: CoverAssetRef) => {
      const canvas = fabricCanvasRef.current;
      const fabricLib = window.fabric;
      if (!canvas || !fabricLib) return;

      // For data: URLs, no CORS issues — load directly via Fabric.
      // For http URLs, we manually load the image with our smart
      // loader, then construct a fabric.Image from the loaded element.
      const isDataUrl = url.startsWith('data:');

      const onImage = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        img: any,
        meta: { corsClean: boolean }
      ) => {
        if (!img) {
          setLoadErrors((prev) =>
            prev.includes(name) ? prev : [...prev, name]
          );
          // eslint-disable-next-line no-console
          console.error('[CoverEditor] asset failed to load:', url, name);
          return;
        }
        // Defensive: if naturalWidth is 0, the image didn't actually load.
        const w = img.width ?? img._element?.naturalWidth ?? 0;
        const h = img.height ?? img._element?.naturalHeight ?? 0;
        if (!w || !h) {
          setLoadErrors((prev) =>
            prev.includes(name) ? prev : [...prev, name]
          );
          // eslint-disable-next-line no-console
          console.error('[CoverEditor] asset has zero dimensions:', url, name);
          return;
        }

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
            lockUniScaling: true,
            lockScalingFlip: true,
          });
        } else {
          const maxEdge = Math.max(w, h);
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

        img.setControlsVisibility?.({
          mt: false, mb: false, ml: false, mr: false,
          mtr: true, tl: true, tr: true, bl: true, br: true,
        });

        // Filters only work on CORS-clean images. Skip otherwise.
        if (restore?.invert && meta.corsClean) {
          const f = makeFillColorFilter(fabricLib, '#ffffff');
          img.filters = f ? [f] : [];
          img.applyFilters?.();
        } else if (restore?.invert && !meta.corsClean) {
          // eslint-disable-next-line no-console
          console.warn(
            '[CoverEditor] cannot apply invert filter (image not CORS-clean):',
            name
          );
        }

        canvas.add(img);
        if (!restore) canvas.setActiveObject(img);
        canvas.renderAll();

        setAssets((prev) => [
          ...prev,
          {
            id,
            name,
            // v41: keep the dataUrl populated even when loading from
            // an http URL — used for thumbnails and as a save fallback.
            dataUrl: url.startsWith('data:') ? url : '',
            url: url.startsWith('http') ? url : undefined,
            inverted: restore?.invert ?? false,
            fabricObj: img,
          },
        ]);
      };

      if (isDataUrl) {
        fabricLib.Image.fromURL(url, (img: unknown) =>
          onImage(img, { corsClean: true })
        );
      } else {
        // Manual load with fallback. Try CORS first, then plain.
        const corsImg = new Image();
        corsImg.crossOrigin = 'anonymous';
        let resolved = false;

        const onLoadCorsClean = () => {
          if (resolved) return;
          if (!corsImg.naturalWidth) {
            // 0×0 → CORS failed silently. Try plain.
            tryPlain();
            return;
          }
          resolved = true;
          // Wrap in fabric.Image
          const fImg = new fabricLib.Image(corsImg, {
            crossOrigin: 'anonymous',
          });
          onImage(fImg, { corsClean: true });
        };
        const onErrorCors = () => {
          if (resolved) return;
          tryPlain();
        };
        const tryPlain = () => {
          if (resolved) return;
          resolved = true;
          // eslint-disable-next-line no-console
          console.warn(
            '[CoverEditor] CORS load failed, retrying without CORS for:',
            url
          );
          const plain = new Image();
          plain.onload = () => {
            if (!plain.naturalWidth) {
              // eslint-disable-next-line no-console
              console.error('[CoverEditor] plain load also produced 0×0:', url);
              setLoadErrors((prev) =>
                prev.includes(name) ? prev : [...prev, name]
              );
              return;
            }
            const fImg = new fabricLib.Image(plain);
            onImage(fImg, { corsClean: false });
          };
          plain.onerror = () => {
            // eslint-disable-next-line no-console
            console.error('[CoverEditor] both load attempts failed:', url);
            setLoadErrors((prev) =>
              prev.includes(name) ? prev : [...prev, name]
            );
          };
          plain.src = url;
        };

        corsImg.onload = onLoadCorsClean;
        corsImg.onerror = onErrorCors;
        corsImg.src = url;

        // Safety timeout
        setTimeout(() => {
          if (!resolved) tryPlain();
        }, 6000);
      }
    },
    []
  );

  // v41 — Logo upload with bullet-proof state tracking.
  // Key change: we generate the asset entry's id in handleFileChange
  // (not inside loadAssetFromUrl's async callback), so the entry
  // exists in state by the time the upload completes. No race with
  // setAssets order.
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
        setPendingUploads((prev) => {
          const next = new Set(prev);
          next.add(file.name);
          return next;
        });
        try {
          const result = await onAssetUpload(file);
          if (result?.url) {
            // v41 retry loop: setAssets may be called BEFORE the fromURL
            // callback has added the entry. Try a few times to find it.
            const tryAttachUrl = (attempt = 0) => {
              setAssets((prev) => {
                const idx = prev.findIndex(
                  (a) => a.name === file.name && !a.url
                );
                if (idx === -1) {
                  if (attempt < 10) {
                    setTimeout(() => tryAttachUrl(attempt + 1), 100);
                  } else {
                    // eslint-disable-next-line no-console
                    console.error(
                      '[CoverEditor] gave up attaching url to asset:',
                      file.name
                    );
                  }
                  return prev;
                }
                const next = [...prev];
                next[idx] = { ...next[idx], url: result.url };
                return next;
              });
            };
            tryAttachUrl();
          } else {
            // eslint-disable-next-line no-console
            console.warn('[CoverEditor] upload returned no url for', file.name);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[CoverEditor] upload threw for', file.name, err);
        } finally {
          setPendingUploads((prev) => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
        }
      }
    });
    e.target.value = '';
  }

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

  function setInvertedState(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    img: any,
    inverted: boolean
  ) {
    const fabricLib = window.fabric;
    if (!fabricLib) return;
    img.perenneInverted = inverted;
    if (inverted) {
      const f = makeFillColorFilter(fabricLib, '#ffffff');
      img.filters = f ? [f] : [];
    } else {
      img.filters = [];
    }
    img.dirty = true;
    if (img._element && img._originalElement) {
      img._element = img._originalElement;
    }
    img.cacheKey = `${img.perenneAssetId ?? 'x'}_${inverted ? 'inv' : 'orig'}_${Date.now()}`;
    img.applyFilters?.();
  }

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
      setAssets((prev) =>
        prev.map((a) =>
          a.autoAdapt ? { ...a, inverted: targetInverted } : a
        )
      );
      setSelTick((t) => t + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgColor]);

  function updateActive(patch: Record<string, number>) {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObj) return;
    activeObj.set(patch);
    activeObj.setCoords?.();
    canvas.requestRenderAll();
    setSelTick((t) => t + 1);
  }

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

  useEffect(() => {
    if (!isActive) return;
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const handle = window.setTimeout(() => {
      const c = fabricCanvasRef.current;
      if (!c) return;
      void recoverCanvasOnVisibility({
        canvas: c,
        assets,
        width: EDITOR_CANVAS_WIDTH,
        height: EDITOR_CANVAS_HEIGHT,
        label: 'CoverEditor',
      });
    }, 50);
    return () => window.clearTimeout(handle);
  }, [isActive, assets]);

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

  // v41: buildConfig SAFE. Only emits assets that have valid url|dataUrl
  // AND valid fabric coordinates (not NaN). Also strips dataUrl when url
  // is set, to keep payload small.
  function buildConfig(): CoverConfigData {
    const validAssets = assets
      .filter((a) => {
        const hasContent = !!(a.url || a.dataUrl);
        const f = a.fabricObj;
        const coordsOk =
          Number.isFinite(f.left) &&
          Number.isFinite(f.top) &&
          Number.isFinite(f.scaleX);
        if (!hasContent) {
          // eslint-disable-next-line no-console
          console.error('[buildConfig] dropping asset without url/dataUrl:', a.name);
        }
        if (!coordsOk) {
          // eslint-disable-next-line no-console
          console.error('[buildConfig] dropping asset with invalid coords:', a.name);
        }
        return hasContent && coordsOk;
      })
      .map((a) => ({
        name: a.name,
        url: a.url,
        dataUrl: a.url ? undefined : a.dataUrl,
        x: +(a.fabricObj.left / EDITOR_CANVAS_WIDTH).toFixed(4),
        y: +(a.fabricObj.top / EDITOR_CANVAS_HEIGHT).toFixed(4),
        scale: +a.fabricObj.scaleX.toFixed(4),
        rotation: +(a.fabricObj.angle || 0).toFixed(2),
        opacity: +(a.fabricObj.opacity ?? 1).toFixed(2),
        invert: a.inverted || undefined,
      }));

    return {
      version: 1,
      canvas: { width: EDITOR_CANVAS_WIDTH, height: EDITOR_CANVAS_HEIGHT },
      cover: {
        backgroundColor: bgColor,
        backgroundImageUrl: bgImageUrl?.startsWith('http') ? bgImageUrl : undefined,
        assets: validAssets,
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

      {loadErrors.length > 0 && (
        <div className="mb-3 py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-amber-500/10 border-amber-500/30 text-amber-200">
          ⚠ Could not load {loadErrors.length} asset(s) from R2: {loadErrors.join(', ')}.
          This usually means CORS isn&apos;t configured on your R2 bucket.
          Open browser console for details. Re-uploading the file works around it.
          <button
            type="button"
            onClick={() => setLoadErrors([])}
            className="ml-2 underline"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-[260px_1fr_300px] gap-3.5 h-[calc(100vh-200px)]">
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

        <aside className="glass p-5 flex flex-col gap-6 overflow-y-auto">
          <div>
            <SectionLabel>Cover background</SectionLabel>

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

            <ColorPicker
              label={bgImageUrl ? 'Fallback color' : 'Color'}
              value={bgColor}
              onChange={setBgColor}
            />
          </div>

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

      <div className="flex gap-3 mt-4 justify-end">
        <Button onClick={handleReset}>Reset</Button>
        <Button onClick={handleExport}>Export JSON</Button>
        <Button
          variant="primary"
          onClick={handleSave}
          loading={saving || pendingUploads.size > 0}
          disabled={!onSave}
          title={
            pendingUploads.size > 0
              ? `Uploading ${pendingUploads.size} file(s)... save anyway and they'll be re-uploaded next time`
              : undefined
          }
        >
          Save Cover
        </Button>
      </div>
    </>
  );
}
