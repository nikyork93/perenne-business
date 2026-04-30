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
  perenneAssetId?: number;
  perenneAssetName?: string;
  perenneInverted?: boolean;
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
  fabricObj: FabricImageLike;
}

interface CoverEditorProps {
  initialConfig?: CoverConfigData;
  onSave?: (config: CoverConfigData) => Promise<void> | void;
  onAssetUpload?: (file: File) => Promise<{ url: string } | null>;
  onBackgroundUpload?: (file: File) => Promise<{ url: string } | null>;
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

          // Bug 4 fix: use FillColor white instead of stock Invert.
          if (restore?.invert) {
            const f = makeFillColorFilter(fabricLib, '#ffffff');
            img.filters = f ? [f] : [];
            img.applyFilters?.();
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

  // Bug 4 fix: toggle invert via FillColor white filter
  function toggleInvert() {
    const canvas = fabricCanvasRef.current;
    const fabricLib = window.fabric;
    if (!canvas || !fabricLib || !activeObj) return;

    const isInverted = !activeObj.perenneInverted;
    activeObj.perenneInverted = isInverted;

    if (isInverted) {
      const f = makeFillColorFilter(fabricLib, '#ffffff');
      activeObj.filters = f ? [f] : [];
    } else {
      activeObj.filters = [];
    }
    activeObj.applyFilters?.();
    canvas.renderAll();

    // Sync to assets array
    setAssets((prev) =>
      prev.map((a) =>
        a.id === activeObj.perenneAssetId ? { ...a, inverted: isInverted } : a
      )
    );
    setSelTick((t) => t + 1);
  }

  // ─── Property editors ──────────────────────────────────────────────
  function updateActive(patch: Record<string, number>) {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObj) return;
    activeObj.set(patch);
    activeObj.setCoords?.();
    canvas.renderAll();
    setSelTick((t) => t + 1);
  }

  // ─── Templates ─────────────────────────────────────────────────────
  function applyTemplate(name: 'minimal' | 'corporate' | 'bold') {
    if (assets.length === 0) {
      alert('Upload at least one logo first.');
      return;
    }
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const primary = assets[0].fabricObj;
    const setup: Record<string, Record<string, number>> = {
      minimal:   { left: EDITOR_CANVAS_WIDTH / 2,    top: EDITOR_CANVAS_HEIGHT / 2,    scaleX: 0.35, scaleY: 0.35, angle: 0, opacity: 1 },
      corporate: { left: EDITOR_CANVAS_WIDTH * 0.25, top: EDITOR_CANVAS_HEIGHT * 0.18, scaleX: 0.30, scaleY: 0.30, angle: 0, opacity: 1 },
      bold:      { left: EDITOR_CANVAS_WIDTH / 2,    top: EDITOR_CANVAS_HEIGHT / 2,    scaleX: 0.75, scaleY: 0.75, angle: 0, opacity: 1 },
    };
    primary.set(setup[name]);
    primary.setCoords?.();
    canvas.setActiveObject(primary);
    canvas.renderAll();
    setSelTick((t) => t + 1);
  }

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
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
  }, [activeObj]);

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
                const isActive = activeObj?.perenneAssetId === a.id;
                return (
                  <div
                    key={a.id}
                    onClick={() => selectAsset(a)}
                    className={`group flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition ${
                      isActive
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
            <SectionLabel>Templates</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {(['minimal', 'corporate', 'bold'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => applyTemplate(name)}
                  className="btn !justify-start !px-3"
                >
                  <span className="font-display italic capitalize">{name}</span>
                  <span className="ml-auto text-[10px] text-ink-faint">
                    {name === 'minimal' ? 'center' : name === 'corporate' ? 'top-left' : 'fill'}
                  </span>
                </button>
              ))}
            </div>
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
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.1em] text-ink-faint py-1.5 px-3.5 bg-black/30 backdrop-blur border border-glass-border rounded-full">
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
                  onChange={(e) => {
                    const s = Number(e.target.value) / 100;
                    updateActive({ scaleX: s, scaleY: s });
                  }}
                />
                <Slider
                  label="Rotation"
                  displayValue={`${activeValues.rotation}°`}
                  min={-180}
                  max={180}
                  value={activeValues.rotation}
                  onChange={(e) => updateActive({ angle: Number(e.target.value) })}
                />
                <Slider
                  label="Opacity"
                  displayValue={`${activeValues.opacityPct}%`}
                  min={0}
                  max={100}
                  value={activeValues.opacityPct}
                  onChange={(e) => updateActive({ opacity: Number(e.target.value) / 100 })}
                />

                {/* Invert color toggle — FillColor white filter */}
                <button
                  type="button"
                  onClick={toggleInvert}
                  className={`btn !w-full !justify-center transition ${
                    activeValues.inverted
                      ? 'bg-accent/15 border-accent/40 text-accent'
                      : ''
                  }`}
                >
                  <span>
                    {activeValues.inverted ? '✓ Inverted' : 'Invert color'}
                  </span>
                  <span className="ml-2 text-[10px] text-ink-faint">B ↔ W</span>
                </button>

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
