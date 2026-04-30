/**
 * paperPresets.ts — v21
 *
 * Local-only paper preview helpers for the page editor. Nothing here is
 * persisted to the DB or to the iOS notebook config — this is a "feel"
 * preview so the user can design watermarks against a representative
 * paper background.
 *
 * The pattern engine intentionally mirrors the iOS implementation
 * (Perenne Note / PaperPatterns.swift) so what you see here matches
 * what the user will see in the actual notebook:
 *
 *   - paper types: BLANK / RULED / GRID / DOTS
 *   - base spacing: 24pt at 725pt page width  →  ~13px at our 392px
 *     editor canvas (24 × 392/725 ≈ 12.97). We round to 13.
 *   - line width: 1.5
 *   - dot diameter: 2.5 (iOS uses dotSize 1.75 × 1.4 = 2.45 effective)
 *   - line/dot color uses iOS alpha values:
 *       light: black @ 0.08 (line), black @ 0.22 (dot)
 *       dark : white @ 0.25 (line), white @ 0.35 (dot)
 *   - dark/light decision via the same luminance formula iOS uses:
 *       (0.299*R + 0.587*G + 0.114*B) / 255 < 0.5
 *
 * The 8 presets include all 4 colors that ship in the iOS app today
 * (FDFBF7, F5F5DC, 27272a, 1e293b — see CustomToolbar.swift) plus four
 * extras for variety in the editor preview only.
 */

export type PaperPattern = 'BLANK' | 'RULED' | 'GRID' | 'DOTS';

export interface PaperPreset {
  name: string;
  hex: string;
}

/**
 * 8-preset palette. Default (index 0) is a warm cream that reads as
 * "real paper" without being yellow enough to fight watermark colors.
 */
export const PAPER_PRESETS: readonly PaperPreset[] = [
  { name: 'Cream', hex: '#FAF7E8' },        // default — warm off-white
  { name: 'Off-white', hex: '#FDFBF7' },    // iOS paper #1 (default in Perenne Note)
  { name: 'Beige', hex: '#F5F5DC' },        // iOS paper #2
  { name: 'White', hex: '#FFFFFF' },        // pure white
  { name: 'Ivory', hex: '#F4EAD5' },        // aged ivory
  { name: 'Parchment', hex: '#E8DCC4' },    // old paper
  { name: 'Charcoal', hex: '#27272A' },     // iOS paper #3 — dark
  { name: 'Navy', hex: '#1E293B' },         // iOS paper #4 — dark
] as const;

export const DEFAULT_PAPER_HEX = '#FAF7E8';
export const DEFAULT_PAPER_PATTERN: PaperPattern = 'BLANK';
export const DEFAULT_PAPER_SCALE = 1.0;

// ─── Pattern-engine constants (mirror iOS) ───────────────────────────

/**
 * Editor canvas is 392px wide vs the iOS notebook page at 725pt. To make
 * the pattern scale match what the user will see in-app at 1.0x, we
 * pre-scale the iOS base spacing by 392/725. Result: 24 * 0.5407 ≈ 13.
 */
const BASE_SPACING = 13;
const LINE_WIDTH = 1.5;
const DOT_DIAMETER = 2.5;

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Returns true if the given paper color is "dark" (perceived luminance
 * below 0.5). Same formula as iOS so dark-paper detection matches.
 */
export function isPaperDark(hex: string): boolean {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/**
 * Encode a string as base64 — works in browser and SSR.
 * Used to inline the SVG tile as a data URL.
 */
function toBase64(s: string): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    // unescape/encodeURIComponent dance to handle multi-byte chars safely.
    // Our SVG is pure ASCII so a direct btoa is also safe — keeping the
    // robust form in case a future preset name leaks into the tile.
    return window.btoa(unescape(encodeURIComponent(s)));
  }
  // SSR fallback (this module is imported by client components but Next
  // may still bundle it during prerender).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (globalThis as any).Buffer;
  if (B && typeof B.from === 'function') {
    return B.from(s, 'utf-8').toString('base64');
  }
  return '';
}

// ─── Pattern background builder ──────────────────────────────────────

export interface PatternBackgroundCSS {
  /** CSS background-image value (data URL) — undefined for BLANK. */
  backgroundImage?: string;
  /** CSS background-size value (e.g. "13px 13px") — undefined for BLANK. */
  backgroundSize?: string;
  /** Make BLANK explicit so callers can `style={{ backgroundImage: 'none', ...result }}`. */
  backgroundRepeat?: string;
}

/**
 * Build a CSS-ready background for the paper-preview backdrop.
 *
 * @param pattern  Pattern type (BLANK is a no-op).
 * @param paperHex Paper color — used only to pick light vs dark stroke.
 *                 The actual paper *fill* is set separately by the caller.
 * @param scale    Scale factor (1 = 100%). Bounded internally to [0.1, 10].
 */
export function buildPatternBackground(
  pattern: PaperPattern,
  paperHex: string,
  scale: number = 1
): PatternBackgroundCSS {
  if (pattern === 'BLANK') return {};

  // Bound scale to avoid degenerate/exploding tile sizes
  const s = Math.max(0.1, Math.min(10, scale));
  const sp = +(BASE_SPACING * s).toFixed(2);
  const dark = isPaperDark(paperHex);

  const lineColor = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)';
  const dotColor = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.22)';

  let inner = '';

  if (pattern === 'RULED') {
    // Single horizontal line at the bottom of the tile (matches iOS).
    const y = +(sp - LINE_WIDTH / 2).toFixed(2);
    inner = `<line x1="0" y1="${y}" x2="${sp}" y2="${y}" stroke="${lineColor}" stroke-width="${LINE_WIDTH}"/>`;
  } else if (pattern === 'GRID') {
    const xy = +(sp - LINE_WIDTH / 2).toFixed(2);
    inner =
      `<line x1="0" y1="${xy}" x2="${sp}" y2="${xy}" stroke="${lineColor}" stroke-width="${LINE_WIDTH}"/>` +
      `<line x1="${xy}" y1="0" x2="${xy}" y2="${sp}" stroke="${lineColor}" stroke-width="${LINE_WIDTH}"/>`;
  } else if (pattern === 'DOTS') {
    const r = +(DOT_DIAMETER / 2).toFixed(2);
    const c = +(sp / 2).toFixed(2);
    inner = `<circle cx="${c}" cy="${c}" r="${r}" fill="${dotColor}"/>`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sp}" height="${sp}" viewBox="0 0 ${sp} ${sp}">` +
    inner +
    `</svg>`;

  const b64 = toBase64(svg);
  if (!b64) return {};

  return {
    backgroundImage: `url("data:image/svg+xml;base64,${b64}")`,
    backgroundSize: `${sp}px ${sp}px`,
    backgroundRepeat: 'repeat',
  };
}
