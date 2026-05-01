'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { Button, Slider, Input, SectionLabel, Whisper } from '@/components/ui';
import {
  EDITOR_CANVAS_WIDTH,
  EDITOR_CANVAS_HEIGHT,
  type CoverAssetRef,
} from '@/types/cover';
import { attachSnapGuides, makeFillColorFilter } from './snapGuides';
import {
  PAPER_PRESETS,
  DEFAULT_PAPER_HEX,
  DEFAULT_PAPER_PATTERN,
  DEFAULT_PAPER_SCALE,
  isPaperDark,
  buildPatternBackground,
  type PaperPattern,
} from './paperPresets';

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
  setControlsVisibility?: (v: Record<string, boolean>) => void;
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

interface PageEditorProps {
  initialWatermarks: CoverAssetRef[];
  onSave?: (watermarks: CoverAssetRef[]) => Promise<void> | void;
  onAssetUpload?: (file: File) => Promise<{ url: string } | null>;
  /** Hint kept for backward compat — useState initialiser also checks window.fabric directly. */
  fabricAlreadyLoaded?: boolean;
  /**
   * Whether this editor is the currently visible tab. Used to gate
   * window-level side effects (keyboard listener) so that pressing
   * keys on one editor doesn't act on a hidden sibling editor.
   * Defaults to true for backward compat with callers that don't
   * pass it (e.g. standalone usage outside EditorClient).
   */
  isActive?: boolean;
}

// ─── sessionStorage persistence ──────────────────────────────────────
// Local UI state (paper hex, pattern, scale, default opacity) that
// resets on tab-switch unmount otherwise. sessionStorage so it lives
// for the browser session only — not polluting localStorage long-term.

const SS_KEY = {
  hex: 'perenne.page-editor.paper-hex',
  pattern: 'perenne.page-editor.paper-pattern',
  scale: 'perenne.page-editor.paper-scale',
  defaultOpacity: 'perenne.page-editor.default-opacity',
  spreadView: 'perenne.page-editor.spread-view',
} as const;

function ssGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function ssSet(key: string, val: string) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(key, val); } catch { /* quota / private mode */ }
}

const DEFAULT_OPACITY = 0.3;

const VALID_PATTERNS: ReadonlyArray<PaperPattern> = ['BLANK', 'RULED', 'GRID', 'DOTS'];

/**
 * PageEditor — design watermarks that appear on every page of the notebook
 * EXCEPT the "Property of a thinking human" page (index 1).
 *
 * Canvas shows a single page preview (392 × 540, ratio 0.725, identical
 * to the notebook's physical 725 × 1000 page). The preview backdrop
 * paints the chosen paper colour + optional pattern (BLANK/RULED/GRID/
 * DOTS) under a transparent Fabric canvas. Paper preview is purely
 * local — it is NOT persisted to the DB and has no effect on iOS.
 *
 * v22 changes vs v21:
 *   - CSS shorthand bug: `backgroundColor` instead of `background` on
 *     the paper backdrop and on every thumbnail. The shorthand was
 *     clearing backgroundImage to none, and React's diff wasn't re-
 *     applying the (unchanged) image, so the pattern silently
 *     disappeared whenever the user changed colour.
 *   - iOS-style controls: circle paper-colour swatches with checkmark
 *     when selected; tall page-shaped pattern tiles with no label;
 *     three pattern-size buttons (100/150/200) replacing the slider.
 *   - Caption pill made legible: white text on a darker pill so it
 *     reads in both themes.
 *   - Page corners: rounded only on the LEFT side (top-left, bottom-
 *     left) at 14px so it reads as the left page of an open notebook.
 *   - Default-opacity selector for new uploads (10/20/30/50). Existing
 *     per-watermark slider in the right panel is unchanged.
 *   - sessionStorage persistence so paper-preview / default-opacity
 *     state survives the Pages → Cover → Pages tab cycle.
 */
export function PageEditor({
  initialWatermarks,
  onSave,
  onAssetUpload,
  fabricAlreadyLoaded,
  isActive = true,
}: PageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricCanvasRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(1);
  const detachSnapRef = useRef<(() => void) | null>(null);

  /** Fabric ready — initialised from window.fabric so a tab re-mount picks up an already-loaded fabric. */
  const [fabricReady, setFabricReady] = useState<boolean>(() => {
    if (fabricAlreadyLoaded) return true;
    if (typeof window === 'undefined') return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !!(window as any).fabric;
  });

  const [assets, setAssets] = useState<AssetEntry[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeObj, setActiveObj] = useState<any | null>(null);
  const [selTick, setSelTick] = useState(0);
  const [saving, setSaving] = useState(false);

  // ─── Paper preview state (local only, persisted to sessionStorage) ─

  const [paperHex, setPaperHex] = useState<string>(() => {
    const saved = ssGet(SS_KEY.hex);
    return saved && /^#[0-9a-f]{6}$/i.test(saved) ? saved : DEFAULT_PAPER_HEX;
  });

  const [paperPattern, setPaperPattern] = useState<PaperPattern>(() => {
    const saved = ssGet(SS_KEY.pattern) as PaperPattern | null;
    return saved && VALID_PATTERNS.includes(saved) ? saved : DEFAULT_PAPER_PATTERN;
  });

  const [paperScale, setPaperScale] = useState<number>(() => {
    const saved = ssGet(SS_KEY.scale);
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n >= 0.5 && n <= 2.0 ? n : DEFAULT_PAPER_SCALE;
  });

  const [defaultOpacity, setDefaultOpacity] = useState<number>(() => {
    const saved = ssGet(SS_KEY.defaultOpacity);
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_OPACITY;
  });

  // Spread view toggle — shows two pages side-by-side (left blank,
  // right is the editable canvas) so the designer can see how the
  // watermark sits in the context of an actual notebook spread.
  // Local-only, persisted to sessionStorage.
  const [spreadView, setSpreadView] = useState<boolean>(() => {
    return ssGet(SS_KEY.spreadView) === '1';
  });
  useEffect(() => {
    ssSet(SS_KEY.spreadView, spreadView ? '1' : '0');
  }, [spreadView]);

  // Mirror state into sessionStorage so the next mount picks up the same values.
  useEffect(() => { ssSet(SS_KEY.hex, paperHex); }, [paperHex]);
  useEffect(() => { ssSet(SS_KEY.pattern, paperPattern); }, [paperPattern]);
  useEffect(() => { ssSet(SS_KEY.scale, String(paperScale)); }, [paperScale]);
  useEffect(() => { ssSet(SS_KEY.defaultOpacity, String(defaultOpacity)); }, [defaultOpacity]);

  // Mirror defaultOpacity into a ref so loadAssetFromUrl (memoised with empty deps)
  // can pick up the latest value without being re-created on every change.
  const defaultOpacityRef = useRef(defaultOpacity);
  useEffect(() => { defaultOpacityRef.current = defaultOpacity; }, [defaultOpacity]);

  // ─── Fabric-ready safety net ───────────────────────────────────────
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
      backgroundColor: 'transparent',
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

    if (initialWatermarks?.length) {
      initialWatermarks.forEach((a) => {
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

  // ─── Asset loader ──────────────────────────────────────────────────
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
              lockUniScaling: true,
              lockScalingFlip: true,
            });
          } else {
            const maxEdge = Math.max(img.width ?? 100, img.height ?? 100);
            const scale = (EDITOR_CANVAS_WIDTH * 0.25) / maxEdge;
            img.set({
              left: EDITOR_CANVAS_WIDTH / 2,
              top: EDITOR_CANVAS_HEIGHT / 2,
              originX: 'center',
              originY: 'center',
              scaleX: scale,
              scaleY: scale,
              opacity: defaultOpacityRef.current,
              lockUniScaling: true,
              lockScalingFlip: true,
            });
          }

          img.setControlsVisibility({
            mt: false, mb: false, ml: false, mr: false,
            mtr: true, tl: true, tr: true, bl: true, br: true,
          });

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

  // ─── Upload ────────────────────────────────────────────────────────
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

    setAssets((prev) =>
      prev.map((a) =>
        a.id === activeObj.perenneAssetId ? { ...a, inverted: isInverted } : a
      )
    );
    setSelTick((t) => t + 1);
  }

  function updateActive(patch: Record<string, number>) {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObj) return;
    activeObj.set(patch);
    activeObj.setCoords?.();
    // requestRenderAll (RAF-coalesced) instead of renderAll (sync).
    // For slider drags firing 60+ events/sec, sync renderAll did
    // technically run each tick, but some browsers postponed the paint
    // until idle, making the canvas look frozen during drag. RAF
    // schedules the render at a paint boundary, which browsers honour
    // predictably — visible live updates.
    canvas.requestRenderAll();
    setSelTick((t) => t + 1);
  }

  // ─── Quick position ────────────────────────────────────────────────
  function applyPosition(name: 'tl' | 'tr' | 'bl' | 'br' | 'center') {
    if (assets.length === 0) {
      alert('Upload at least one watermark first.');
      return;
    }
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const target = activeObj ?? assets[0].fabricObj;
    const margin = 0.12;
    const positions: Record<string, { x: number; y: number }> = {
      tl: { x: margin, y: margin },
      tr: { x: 1 - margin, y: margin },
      bl: { x: margin, y: 1 - margin },
      br: { x: 1 - margin, y: 1 - margin },
      center: { x: 0.5, y: 0.5 },
    };
    const p = positions[name];
    target.set({
      left: p.x * EDITOR_CANVAS_WIDTH,
      top: p.y * EDITOR_CANVAS_HEIGHT,
    });
    target.setCoords?.();
    canvas.setActiveObject(target);
    canvas.renderAll();
    setSelTick((t) => t + 1);
  }

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  // Gated by `isActive` so the listener is only attached when this
  // editor is the currently-visible tab. Without this guard, pressing
  // Arrow / Delete on the active tab would also move/delete the active
  // object on the hidden sibling editor (since both are mounted).
  useEffect(() => {
    if (!isActive) return;
    function handleKey(e: KeyboardEvent) {
      if (!activeObj) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') { updateActive({ left: activeObj.left - step }); e.preventDefault(); }
      if (e.key === 'ArrowRight') { updateActive({ left: activeObj.left + step }); e.preventDefault(); }
      if (e.key === 'ArrowUp') { updateActive({ top: activeObj.top - step }); e.preventDefault(); }
      if (e.key === 'ArrowDown') { updateActive({ top: activeObj.top + step }); e.preventDefault(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeObj.perenneAssetId != null) removeAsset(activeObj.perenneAssetId);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeObj, isActive]);

  // ─── Save ──────────────────────────────────────────────────────────
  function buildWatermarks(): CoverAssetRef[] {
    return assets.map((a) => ({
      name: a.name,
      url: a.url,
      x: +(a.fabricObj.left / EDITOR_CANVAS_WIDTH).toFixed(4),
      y: +(a.fabricObj.top / EDITOR_CANVAS_HEIGHT).toFixed(4),
      scale: +a.fabricObj.scaleX.toFixed(4),
      rotation: +(a.fabricObj.angle || 0).toFixed(2),
      opacity: +(a.fabricObj.opacity ?? 1).toFixed(2),
      invert: a.inverted || undefined,
    }));
  }

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(buildWatermarks());
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!confirm('Remove all watermarks?')) return;
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      assets.forEach((a) => canvas.remove(a.fabricObj));
      canvas.renderAll();
    }
    setAssets([]);
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

  // ─── Paper preview backdrop CSS ────────────────────────────────────
  const patternBg = buildPatternBackground(paperPattern, paperHex, paperScale);
  const paperIsDark = isPaperDark(paperHex);
  const checkColor = paperIsDark ? '#ffffff' : '#0a0a0f';

  // Page corner radius — when shown alone or as right page of a spread:
  // rounded only on the outer (right) edges; spine side stays straight.
  // When shown as left page in a spread, mirror the radius.
  const PAGE_RADIUS_RIGHT = '0 14px 14px 0';   // single page / right of spread
  const PAGE_RADIUS_LEFT  = '14px 0 0 14px';   // left of spread (mirror)
  // Backward compat — the existing canvas style uses PAGE_RADIUS still.
  // We re-define to a sensible default for the editable canvas:
  const PAGE_RADIUS = spreadView ? PAGE_RADIUS_RIGHT : '14px';

  return (
    <>
      {!fabricAlreadyLoaded && (
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js"
          strategy="afterInteractive"
          onLoad={() => setFabricReady(true)}
        />
      )}

      <div className="grid grid-cols-[260px_1fr_300px] gap-3.5 h-[calc(100vh-200px)]">
        {/* ── LEFT PANEL ─────────────────────────────────────── */}
        <aside className="glass p-5 flex flex-col gap-6 overflow-y-auto">
          {/* Watermarks */}
          <div>
            <SectionLabel>Page watermarks</SectionLabel>
            <Button variant="upload" onClick={() => fileInputRef.current?.click()}>
              <span className="text-base leading-none">+</span>
              <span>Upload watermark</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            <p className="mt-3 text-[10px] text-ink-faint leading-relaxed font-mono">
              Watermarks appear on every page of the notebook except the
              <span className="text-accent"> &ldquo;Property of&rdquo;</span> page.
              Position is identical on each page.
            </p>

            <div className="mt-3 flex flex-col gap-1.5">
              {assets.length === 0 && (
                <Whisper className="py-4">No watermarks yet.</Whisper>
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

          {/* Default opacity for new uploads */}
          <div>
            <SectionLabel>Default opacity</SectionLabel>
            <div className="grid grid-cols-4 gap-1.5">
              {[0.1, 0.2, 0.3, 0.5].map((o) => {
                const active = Math.abs(defaultOpacity - o) < 0.005;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setDefaultOpacity(o)}
                    className={`btn !justify-center !text-[11px] !py-2 !px-1 ${
                      active ? '!bg-accent/15 !border-accent !text-accent' : ''
                    }`}
                    aria-pressed={active}
                  >
                    {Math.round(o * 100)}%
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[9px] text-ink-faint leading-relaxed font-mono">
              Applied to new uploads. Per-watermark control in the right panel.
            </p>
          </div>

          {/* Paper preview — iOS-style controls */}
          <div>
            <SectionLabel>Paper preview</SectionLabel>

            {/* — Paper colour: circles with checkmark, like iOS PaperMenu — */}
            <div className="text-[10px] text-ink-dim font-mono mb-2 tracking-wider">paper color</div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {PAPER_PRESETS.map((p) => {
                const active = p.hex.toLowerCase() === paperHex.toLowerCase();
                return (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => setPaperHex(p.hex)}
                    title={`${p.name} · ${p.hex}`}
                    aria-label={p.name}
                    aria-pressed={active}
                    className="aspect-square rounded-full border border-glass-border cursor-pointer transition-transform hover:scale-110 relative flex items-center justify-center"
                    // ⚠️ backgroundColor (NOT shorthand `background`) — see file header.
                    style={{ backgroundColor: p.hex }}
                  >
                    {active && (
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 12l5 5L20 7"
                          stroke={checkColor}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* — Pattern: tall page-shaped tiles, no label, like iOS — */}
            <div className="text-[10px] text-ink-dim font-mono mb-2 tracking-wider">pattern</div>
            <div className="grid grid-cols-4 gap-1.5 mb-4">
              {VALID_PATTERNS.map((pt) => {
                const active = paperPattern === pt;
                // Tile pattern at scale=0.4 so several lines/dots fit
                // inside the small thumb without feeling sparse.
                const thumbBg = buildPatternBackground(pt, paperHex, 0.4);
                return (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setPaperPattern(pt)}
                    title={pt}
                    aria-label={pt}
                    aria-pressed={active}
                    className={`rounded-md cursor-pointer transition relative overflow-hidden ${
                      active
                        ? 'ring-2 ring-accent ring-offset-0'
                        : 'border border-glass-border hover:border-glass-hairline'
                    }`}
                    // Page-shaped aspect (slightly taller than wide). 0.725 matches the
                    // notebook's physical page ratio.
                    style={{
                      aspectRatio: '0.725',
                      backgroundColor: paperHex,
                      backgroundImage: thumbBg.backgroundImage,
                      backgroundSize: thumbBg.backgroundSize,
                      backgroundRepeat: thumbBg.backgroundRepeat,
                    }}
                  />
                );
              })}
            </div>

            {/* — Pattern size: 3 buttons, matches iOS PaperMenu exactly — */}
            <div className="text-[10px] text-ink-dim font-mono mb-2 tracking-wider">pattern size</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[1.0, 1.5, 2.0].map((s) => {
                const active = Math.abs(paperScale - s) < 0.01;
                const disabled = paperPattern === 'BLANK';
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPaperScale(s)}
                    disabled={disabled}
                    aria-pressed={active}
                    className={`btn !justify-center !text-[11px] !py-2 ${
                      active && !disabled
                        ? '!bg-accent/15 !border-accent !text-accent'
                        : ''
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {Math.round(s * 100)}%
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-[9px] text-ink-faint leading-relaxed font-mono">
              Local preview only — not saved with the notebook.
            </p>
          </div>

          {/* Spread view toggle ─────────────────────────────────── */}
          <div>
            <SectionLabel>View mode</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setSpreadView(false)}
                aria-pressed={!spreadView}
                className={`btn !p-2 !text-[10px] flex flex-col items-center gap-1 ${
                  !spreadView ? 'bg-accent/15 border-accent/40 text-accent' : ''
                }`}
                title="Single page"
              >
                {/* mini icon: 1 page */}
                <span style={{ display: 'inline-block', width: 14, height: 18, background: 'currentColor', opacity: 0.6, borderRadius: 2 }} />
                Single
              </button>
              <button
                type="button"
                onClick={() => setSpreadView(true)}
                aria-pressed={spreadView}
                className={`btn !p-2 !text-[10px] flex flex-col items-center gap-1 ${
                  spreadView ? 'bg-accent/15 border-accent/40 text-accent' : ''
                }`}
                title="Spread (2 pages)"
              >
                {/* mini icon: 2 pages */}
                <span style={{ display: 'inline-flex', gap: 1 }}>
                  <span style={{ display: 'inline-block', width: 10, height: 18, background: 'currentColor', opacity: 0.6, borderRadius: '2px 0 0 2px' }} />
                  <span style={{ display: 'inline-block', width: 10, height: 18, background: 'currentColor', opacity: 0.6, borderRadius: '0 2px 2px 0' }} />
                </span>
                Spread
              </button>
            </div>
          </div>

          {/* Quick position */}
          <div>
            <SectionLabel>Quick position</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" onClick={() => applyPosition('tl')} className="btn !p-2 !text-[10px]" title="Top-left">↖</button>
              <button type="button" onClick={() => applyPosition('center')} className="btn !p-2 !text-[10px]" title="Center">●</button>
              <button type="button" onClick={() => applyPosition('tr')} className="btn !p-2 !text-[10px]" title="Top-right">↗</button>
              <button type="button" onClick={() => applyPosition('bl')} className="btn !p-2 !text-[10px]" title="Bottom-left">↙</button>
              <span />
              <button type="button" onClick={() => applyPosition('br')} className="btn !p-2 !text-[10px]" title="Bottom-right">↘</button>
            </div>
          </div>
        </aside>

        {/* ── CENTER: Single page or spread preview ───────────── */}
        <main className="glass flex items-center justify-center relative overflow-hidden">
          <div
            className="flex items-stretch"
            style={{
              filter:
                'drop-shadow(0 40px 80px rgba(0,0,0,0.35)) drop-shadow(0 12px 24px rgba(0,0,0,0.25))',
            }}
          >
            {/* Optional LEFT page (spread view only) — non-editable
                mirror that shows just the paper colour + pattern, so
                the user gets the spatial sense of a notebook spread.
                Watermarks themselves are rendered only on the editable
                right page; in the real notebook each page gets the same
                watermark anyway, so the left page would visually echo
                the right one — we keep it bare here to avoid drawing
                the same watermark twice and confusing the user about
                which one is being edited. */}
            {spreadView && (
              <div
                style={{
                  width: EDITOR_CANVAS_WIDTH,
                  height: EDITOR_CANVAS_HEIGHT,
                  backgroundColor: paperHex,
                  backgroundImage: patternBg.backgroundImage,
                  backgroundSize: patternBg.backgroundSize,
                  backgroundRepeat: patternBg.backgroundRepeat,
                  borderRadius: PAGE_RADIUS_LEFT,
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08), inset -8px 0 12px -8px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
                aria-hidden
              />
            )}

            {/* RIGHT page (or single page when spread is off) —
                contains the actual editable Fabric canvas. */}
            <div
              className="overflow-hidden"
              style={{
                borderRadius: PAGE_RADIUS,
                boxShadow: spreadView
                  ? 'inset 0 0 0 1px rgba(0,0,0,0.08), inset 8px 0 12px -8px rgba(0,0,0,0.25)'
                  : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
              }}
            >
              <div
                style={{
                  width: EDITOR_CANVAS_WIDTH,
                  height: EDITOR_CANVAS_HEIGHT,
                  backgroundColor: paperHex,
                  backgroundImage: patternBg.backgroundImage,
                  backgroundSize: patternBg.backgroundSize,
                  backgroundRepeat: patternBg.backgroundRepeat,
                  position: 'relative',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={EDITOR_CANVAS_WIDTH}
                  height={EDITOR_CANVAS_HEIGHT}
                />
              </div>
            </div>
          </div>

          {/* Caption pill */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.1em] text-white/85 py-1.5 px-3.5 bg-black/55 backdrop-blur border border-white/10 rounded-full whitespace-nowrap">
            {spreadView
              ? 'spread view · the right page is editable · all pages get the same watermark'
              : 'single page · 725×1000 ratio · applies to all pages except “Property of”'}
          </div>
        </main>

        {/* ── RIGHT PANEL ─────────────────────────────────────── */}
        <aside className="glass p-5 flex flex-col gap-6 overflow-y-auto">
          <div>
            <SectionLabel>Selection</SectionLabel>
            {!activeValues ? (
              <Whisper className="py-5">
                Select a watermark on the page to edit its properties.
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

                <button
                  type="button"
                  onClick={toggleInvert}
                  className={`btn !w-full !justify-center transition ${
                    activeValues.inverted
                      ? 'bg-accent/15 border-accent/40 text-accent'
                      : ''
                  }`}
                >
                  <span>{activeValues.inverted ? '✓ Inverted' : 'Invert color'}</span>
                  <span className="ml-2 text-[10px] text-ink-faint">B ↔ W</span>
                </button>

                <Button
                  variant="danger"
                  block
                  onClick={() => {
                    if (activeObj?.perenneAssetId != null) removeAsset(activeObj.perenneAssetId);
                  }}
                >
                  Delete watermark
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Bottom toolbar ─────────────────────────────────────── */}
      <div className="flex gap-3 mt-4 justify-end">
        <Button onClick={handleReset}>Reset</Button>
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!onSave}>
          Save Watermarks
        </Button>
      </div>
    </>
  );
}
