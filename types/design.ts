/**
 * Design library — types for the new design-as-template architecture.
 *
 * A Design is a reusable editable template owned by a company. When
 * the company purchases a batch of codes (an Order), the chosen
 * Design is COPIED into Order.designSnapshotJson so subsequent edits
 * to the Design don't mutate already-shipped notebooks.
 *
 * Coordinates and editor units match types/cover.ts — Design wraps
 * the same CoverConfigData shape, just with a name + lifecycle bits.
 */

import type { CoverAssetRef } from './cover';

// ── DB row, full ────────────────────────────────────────────────────
export interface Design {
  id: string;
  companyId: string;
  name: string;

  backgroundColor: string;
  backgroundImageUrl: string | null;
  assetsJson: CoverAssetRef[];           // typed Json
  pageWatermarksJson: CoverAssetRef[] | null;
  quoteText: string | null;
  quotePosition: string | null;
  quoteColor: string | null;

  previewPngUrl: string | null;

  isArchived: boolean;
  isDefault: boolean;

  createdAt: Date;
  updatedAt: Date;
}

// ── List view (lightweight; no big arrays) ──────────────────────────
export interface DesignSummary {
  id: string;
  name: string;
  isDefault: boolean;
  isArchived: boolean;
  previewPngUrl: string | null;
  /** Number of orders that snapshotted this design (read-only context) */
  orderCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Snapshot — the FROZEN JSON stored on Order.designSnapshotJson ───
//
// Self-contained JSON that iOS (post-Session-3) can read to reproduce
// a notebook's cover and page watermarks without needing to look up
// the source Design row. Snapshot taken at PENDING order creation in
// /api/checkout (so the user gets exactly what they saw when they
// clicked Buy, even if the Design is edited between PENDING and PAID).
export interface DesignSnapshot {
  /** Schema version — bump if the shape changes incompatibly */
  v: 1;
  backgroundColor: string;
  backgroundImageUrl: string | null;
  assets: CoverAssetRef[];
  pageWatermarks: CoverAssetRef[];
  quote: {
    text: string | null;
    position: string;
    color: string;
  } | null;
}

// ── Create / update payloads ────────────────────────────────────────
export interface CreateDesignBody {
  name: string;
  /** Optional — if provided, copies content from this design instead of starting empty */
  copyFromDesignId?: string;
}

export interface UpdateDesignBody {
  name?: string;
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
  assets?: CoverAssetRef[];
  pageWatermarks?: CoverAssetRef[] | null;
  quote?: {
    text: string | null;
    position: string;
    color: string;
  } | null;
  previewPngUrl?: string | null;
}
