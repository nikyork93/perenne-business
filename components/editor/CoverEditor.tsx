'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { Button, Slider, ColorPicker, Input, SectionLabel, Whisper } from '@/components/ui';
import {
  EDITOR_CANVAS_WIDTH,
  EDITOR_CANVAS_HEIGHT,
  DEFAULT_COVER_CONFIG,
  type CoverConfigData,
  type CoverAssetRef,
} from '@/types/cover';

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
  set: (props: Record<string, unknown>) => void;
}

interface AssetEntry {
  id: number;
  name: string;
  dataUrl: string;
  url?: string;              // persistent URL after upload
  fabricObj: FabricImageLike;
}

interface CoverEditorProps {
  /** Initial config to restore (e.g. from DB) */
  initialConfig?: CoverConfigData;
  /** Called on Save button; parent persists the config */
  onSave?: (config: CoverConfigData) => Promise<void> | void;
  /** Called when an asset is uploaded; should return persistent URL */
  onAssetUpload?: (file: File) => Promise<{ url: string } | null>;
}

export function CoverEditor({ initialConfig, onSave, onAssetUpload }: CoverEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricCanvasRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(1);

  const [fabricReady, setFabricReady] = useState(false);
  const [bgColor, setBgColor] = useState(
    initialConfig?.cover.backgroundColor ?? DEFAULT_COVER_CONFIG.cover.backgroundColor
  );
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeObj, setActiveObj] = useState<any | null>(null);
  const [selTick, setSelTick] = useState(0);  // forces re-render on geometry changes
  const [saving, setSaving] = useState(false);

  // ─── Initialize Fabric canvas once script is loaded ──────
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

    fabricLib.Object.prototype.transparentCorners = false;
    fabricLib.Object.prototype.cornerColor = '#d4a574';
    fabricLib.Object.prototype.cornerStyle = 'circle';
    fabricLib.Object.prototype.cornerStrokeColor = '#0a0a0f';
    fabricLib.Object.prototype.cornerSize = 10;
    fabricLib.Object.prototype.borderColor = '#d4a574';
    fabricLib.Object.prototype.borderScaleFactor = 1.4;
    fabricLib.Object.prototype.rotatingPointOffset = 30;
    fabricLib.Object.prototype.borderDashArray = [4, 4];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSelect = () => {
      setActiveObj(canvas.getActiveObject());
      setSelTick((t) => t + 1);
    };
    canvas.on('selection:created', onSelect);
    canvas.on('selection:updated', onSelect);
    canvas.on('selection:cleared', () => setActiveObj(null));
    canvas.on('object:modified', () => setSelTick((t) => t + 1));
    canvas.on('object:moving',   () => setSelTick((t) => t + 1));
    canvas.on('object:scaling',  () => setSelTick((t) => t + 1));
    canvas.on('object:rotating', () => setSelTick((t) => t + 1));

    fabricCanvasRef.current = canvas;

    // Restore initial assets from DB config
    if (initialConfig?.cover.assets?.length) {
      initialConfig.cover.assets.forEach((a) => {
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

  // ─── Sync bgColor → fabric ────────────────────────────────
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.backgroundColor = bgColor;
    canvas.renderAll();
  }, [bgColor]);

  // ─── Load asset from URL (used both for new uploads and restores) ──
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
            });
          } else {
            // New asset — fit longest edge to ~40% of canvas
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
              fabricObj: img,
            },
          ]);
        },
        { crossOrigin: 'anonymous' }
      );
    },
    []
  );

  // ─── Upload handler ───────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach(async (file) => {
      // Read as data URL for immediate preview
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      loadAssetFromUrl(dataUrl, file.name);

      // If uploader supplied, upload to R2 and swap URL
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

  // ─── Asset operations ─────────────────────────────────────
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

  // ─── Property editors ─────────────────────────────────────
  function updateActive(patch: Record<string, number>) {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeObj) return;
    activeObj.set(patch);
    canvas.renderAll();
    setSelTick((t) => t + 1);
  }

  // ─── Templates ────────────────────────────────────────────
  function applyTemplate(name: 'minimal' | 'corporate' | 'bold') {
    if (assets.length === 0) {
      alert('Upload at least one logo first.');
      return;
    }
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const primary = assets[0].fabricObj;
    const setup: Record<string, Record<string, number>> = {
      minimal:   { left: EDITOR_CANVAS_WIDTH / 2,  top: EDITOR_CANVAS_HEIGHT / 2,  scaleX: 0.35, scaleY: 0.35, angle: 0, opacity: 1 },
      corporate: { left: EDITOR_CANVAS_WIDTH * 0.25, top: EDITOR_CANVAS_HEIGHT * 0.18, scaleX: 0.30, scaleY: 0.30, angle: 0, opacity: 1 },
      bold:      { left: EDITOR_CANVAS_WIDTH / 2,  top: EDITOR_CANVAS_HEIGHT / 2,  scaleX: 0.75, scaleY: 0.75, angle: 0, opacity: 1 },
    };
    primary.set(setup[name]);
    canvas.setActiveObject(primary);
    canvas.renderAll();
    setSelTick((t) => t + 1);
  }

  // ─── Keyboard shortcuts ───────────────────────────────────
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

  // ─── Serialize to config ──────────────────────────────────
  function buildConfig(): CoverConfigData {
    return {
      version: 1,
      canvas: { width: EDITOR_CANVAS_WIDTH, height: EDITOR_CANVAS_HEIGHT },
      cover: {
        backgroundColor: bgColor,
        assets: assets.map((a) => ({
          name: a.name,
          url: a.url,
          x: +(a.fabricObj.left / EDITOR_CANVAS_WIDTH).toFixed(4),
          y: +(a.fabricObj.top / EDITOR_CANVAS_HEIGHT).toFixed(4),
          scale: +a.fabricObj.scaleX.toFixed(4),
          rotation: +(a.fabricObj.angle || 0).toFixed(2),
          opacity: +(a.fabricObj.opacity ?? 1).toFixed(2),
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
      canvas.renderAll();
    }
    setAssets([]);
    setBgColor('#1a1a1a');
  }

  // ─── Derived display values for active object ─────────────
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
      }
    : null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = selTick; // keep selTick as dependency-ish for re-renders

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js"
        strategy="afterInteractive"
        onLoad={() => setFabricReady(true)}
      />

      <div className="grid grid-cols-[260px_1fr_300px] gap-3.5 h-[calc(100vh-140px)]">
        {/* ── LEFT PANEL: Assets + Templates ──────────── */}
        <aside className="glass p-5 flex flex-col gap-6 overflow-y-auto">
          <div>
            <SectionLabel>Assets</SectionLabel>
            <Button
              variant="upload"
              onClick={() => fileInputRef.current?.click()}
            >
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
                        : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.07] hover:border-glass-hairline'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-md bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                      <img
                        src={a.url || a.dataUrl}
                        alt=""
                        className="w-full h-full object-contain"
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

        {/* ── CENTER: Canvas ──────────────────────────── */}
        <main className="glass flex items-center justify-center relative overflow-hidden">
          <div
            className="rounded-md overflow-hidden"
            style={{
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
            Drag · corners resize · top handle rotates
          </div>
        </main>

        {/* ── RIGHT PANEL: Background + Selection ────── */}
        <aside className="glass p-5 flex flex-col gap-6 overflow-y-auto">
          <div>
            <ColorPicker
              label="Cover background"
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
                  min={10}
                  max={300}
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

      {/* ── Bottom toolbar ──────────────────────────── */}
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
