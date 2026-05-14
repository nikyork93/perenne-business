-- Migration: analytics integration credentials
--
-- Extends AdminSettings with App Store Connect API + Firebase service
-- account fields so super-admin can configure analytics integrations
-- from the UI.
--
-- Safe to re-run.

ALTER TABLE "AdminSettings"
  ADD COLUMN IF NOT EXISTS "asc_keyId"       TEXT,
  ADD COLUMN IF NOT EXISTS "asc_issuerId"    TEXT,
  ADD COLUMN IF NOT EXISTS "asc_privateKey"  TEXT,          -- multi-line PEM
  ADD COLUMN IF NOT EXISTS "asc_appId"       TEXT,          -- numeric Apple SKU id, e.g. 6758993077
  ADD COLUMN IF NOT EXISTS "asc_vendorId"    TEXT,          -- 8/9-digit Apple vendor id for sales reports
  ADD COLUMN IF NOT EXISTS "asc_lastSyncAt"  TIMESTAMP(3),

  ADD COLUMN IF NOT EXISTS "fb_serviceAccountJson" TEXT,     -- pasted JSON
  ADD COLUMN IF NOT EXISTS "fb_propertyId"         TEXT,     -- GA4 property id from Firebase Analytics
  ADD COLUMN IF NOT EXISTS "fb_lastSyncAt"         TIMESTAMP(3);

-- Cache table for App Store Connect sales/reports so we don't hit the
-- API on every page load. Keyed by report date + metric.
CREATE TABLE IF NOT EXISTS "AnalyticsSnapshot" (
  "id"          TEXT         PRIMARY KEY,
  "source"      TEXT         NOT NULL,            -- "asc" | "firebase"
  "metric"      TEXT         NOT NULL,            -- "installs" | "revenue" | "dau" | ...
  "date"        DATE         NOT NULL,
  "value"       DOUBLE PRECISION NOT NULL,
  "currency"    TEXT,                             -- only for revenue rows
  "metadata"    JSONB,
  "fetchedAt"   TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsSnapshot_unique"
  ON "AnalyticsSnapshot"("source", "metric", "date");

CREATE INDEX IF NOT EXISTS "AnalyticsSnapshot_source_date"
  ON "AnalyticsSnapshot"("source", "date");
