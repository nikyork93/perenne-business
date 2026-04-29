'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { Button, Slider, Input, SectionLabel, Whisper } from '@/components/ui';
import {
  EDITOR_CANVAS_WIDTH,
  EDITOR_CANVAS_HEIGHT,
  EDITOR_CORNER_RADIUS,
  type CoverAssetRef,
} from '@/types/cover';

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
  /** Hint shown if a Fabric is already loaded — avoids double-load */
  fabricAlreadyLoaded?: boolean;
}

/**
 * PageEditor — design watermarks that appear on every page of the notebook
 * EXCEPT the "Property of a thinking human" page (index 1).
 *
 * Canvas shows a single page preview (392 × 540, ratio 0.725, identical to
 * the notebook's physical 725 × 1000 page). Backdrop uses an off-white
 * paper preview so users can see how watermarks look on a real page.
 */
export function PageEditor({
  initialWatermarks,
  onSave,
  onAssetUpload,
  fabricAlreadyLoaded,
}: PageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricCanvasRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(1);

  const [fabricReady, setFabricReady] = useState(fabricAlreadyLoaded ?? false);
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeObj, setActiveObj] = useState<any | null>(null);
  const [selTick, setSelTick] = useState(0);
  const [saving, setSaving] = useState(false);

  // ─── Initialize Fabric canvas ──────────────────────────────────────
  useEffect(() => {
    if (!fabricReady || !canvasRef.current || fabricCanvasRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fabricLib = (window as any).fabric;
    if (!fabricLib) return;

    const canvas = new fabricLib.Canvas(canvasRef.current, {
      // Off-white paper-like background (lighter than real paper because
      // watermarks need contrast for designing — actual paper is paperColor)
      backgroundColor: '#fafaf7',
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

    const onSelect = () => {
      setActiveObj(canvas.getActiveObject());
      setSelTick((t) => t + 1);
    };
    canvas.on('selection:created', onSelect);
    canvas.on('selection:updated', onSelect);
    canvas.on('selection:cleared', () => setActiveObj(null));
    canvas.on('object:modified', () => setSelTick((t) => t + 1));
    canvas.on('object:moving', () => setSelTick((t) => t + 1));
    canvas.on('object:scaling', () => setSelTick((t) => t + 1));
    canvas.on('object:rotating', () => setSelTick((t) => t + 1));

    fabricCanvasRef.current = canvas;

    // Restore initial watermarks
    if (initialWatermarks?.length) {
      initialWatermarks.forEach((a) => {
        if (a.url || a.dataUrl) {
          loadAssetFromUrl(a.url ?? a.dataUrl ?? '', a.name, a);
        }
      });
    }

    return () => {
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
            // Watermarks default to smaller scale (~25% of canvas) and lower opacity
            const maxEdge = Math.max(img.width ?? 100, img.height ?? 100);
            const scale = (EDITOR_CANVAS_WIDTH * 0.25) / maxEdge;
            img.set({
              left: EDITOR_CANVAS_WIDTH / 2,
              top: EDITOR_CANVAS_HEIGHT / 2,
              originX: 'center',
              originY: 'center',
              scaleX: scale,
              scaleY: scale,
              opacity: 0.3, // watermark default opacity
              lockUniScaling: true,
              lockScalingFlip: true,
            });
          }

          img.setControlsVisibility({
            mt: false, mb: false, ml: false, mr: false,
            mtr: true, tl: true, tr: true, bl: true, br: true,
          });

          if (restore?.invert) {
            img.filters = [new fabricLib.Image.filters.Invert()];
            img.applyFilters();
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
      activeObj.filters = [new fabricLib.Image.filters.Invert()];
    } else {
      activeObj.filters = [];
    }
    activeObj.applyFilters();
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
    canvas.renderAll();
    setSelTick((t) => t + 1);
  }

  // ─── Templates (corner positions for watermarks) ───────────────────
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
    canvas.setActiveObject(target);
    canvas.renderAll();
    setSelTick((t) => t + 1);
  }

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
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
  }, [activeObj]);

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
        {/* ── LEFT PANEL: Watermarks list ────────────────────── */}
        <aside className="glass p-5 flex flex-col gap-6 overflow-y-auto">
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

        {/* ── CENTER: Single page preview ───────────────────── */}
        <main className="glass flex items-center justify-center relative overflow-hidden">
          <div
            className="overflow-hidden"
            style={{
              borderRadius: `${EDITOR_CORNER_RADIUS}px`,
              filter:
                'drop-shadow(0 40px 80px rgba(0,0,0,0.35)) drop-shadow(0 12px 24px rgba(0,0,0,0.25))',
              boxShadow:
                'inset 0 0 0 1px rgba(0,0,0,0.08)',
            }}
          >
            <canvas
              ref={canvasRef}
              width={EDITOR_CANVAS_WIDTH}
              height={EDITOR_CANVAS_HEIGHT}
            />
          </div>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.1em] text-ink-faint py-1.5 px-3.5 bg-black/30 backdrop-blur border border-glass-border rounded-full">
            single page · 725×1000 ratio · applies to all pages except &ldquo;Property of&rdquo;
          </div>
        </main>

        {/* ── RIGHT PANEL: Selection properties ─────────────── */}
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
                  min={5}
                  max={200}
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
