/**
 * paperPresets.ts — v28
 *
 * Local-only paper preview helpers for the page editor. Nothing here is
 * persisted to the DB or to the iOS notebook config — this is a "feel"
 * preview so the user can design watermarks against a representative
 * paper background.
 *
 * The palette is now EXACTLY the 4 colours that ship in Perenne Note
 * iOS today (see Toolbar/CustomToolbar.swift line 58):
 *
 *   "#FDFBF7"  — off-white (default in Perenne Note)
 *   "#F5F5DC"  — beige
 *   "#27272a"  — charcoal
 *   "#1e293b"  — navy
 *
 * Pattern stroke alphas REDUCED 20% from iOS values per user feedback
 * — the editor preview was too "shouty" relative to the actual app:
 *
 *   light:  line 0.08 → 0.064   |   dot 0.22 → 0.176
 *   dark :  line 0.25 → 0.20    |   dot 0.35 → 0.28
 *
 * Other constants (spacing, line width, dot diameter) match iOS 1:1.
 */

export type PaperPattern = 'BLANK' | 'RULED' | 'GRID' | 'DOTS';

export interface PaperPreset {
  name: string;
  hex: string;
}

/**
 * 4-preset palette — IDENTICAL to the iOS app. Order matches the
 * paperColors array in CustomToolbar.swift so the editor experience
 * is consistent with what the user sees on iPad.
 */
export const PAPER_PRESETS: readonly PaperPreset[] = [
  { name: 'Off-white', hex: '#FDFBF7' },
  { name: 'Beige',     hex: '#F5F5DC' },
  { name: 'Charcoal',  hex: '#27272A' },
  { name: 'Navy',      hex: '#1E293B' },
] as const;

export const DEFAULT_PAPER_HEX = '#FDFBF7';
export const DEFAULT_PAPER_PATTERN: PaperPattern = 'BLANK';
export const DEFAULT_PAPER_SCALE = 1.0;

// ─── Pattern-engine constants (mirror iOS) ───────────────────────────

const BASE_SPACING = 13;
const LINE_WIDTH = 1.5;
const DOT_DIAMETER = 2.5;

// ─── Helpers ─────────────────────────────────────────────────────────

export function isPaperDark(hex: string): boolean {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function toBase64(s: string): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(unescape(encodeURIComponent(s)));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (globalThis as any).Buffer;
  if (B && typeof B.from === 'function') {
    return B.from(s, 'utf-8').toString('base64');
  }
  return '';
}

// ─── Pattern background builder ──────────────────────────────────────

export interface PatternBackgroundCSS {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
}

/**
 * Build a CSS-ready background for the paper-preview backdrop.
 * Stroke alphas are 20% softer than iOS — see file header.
 */
export function buildPatternBackground(
  pattern: PaperPattern,
  paperHex: string,
  scale: number = 1
): PatternBackgroundCSS {
  if (pattern === 'BLANK') return {};

  const s = Math.max(0.1, Math.min(10, scale));
  const sp = +(BASE_SPACING * s).toFixed(2);
  const dark = isPaperDark(paperHex);

  // Reduced 20% from iOS values per user feedback (patterns felt too
  // prominent in the editor preview).
  const lineColor = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.064)';
  const dotColor  = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.176)';

  let inner = '';

  if (pattern === 'RULED') {
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
