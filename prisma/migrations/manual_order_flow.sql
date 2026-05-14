-- Migration: manual order flow (replaces Stripe-only checkout)
--
-- Adds:
--   1) Two values to the OrderStatus enum: AWAITING_PAYMENT, CANCELLED
--   2) New columns on "Order" for the manual flow
--
-- Run this in the Neon SQL editor BEFORE deploying the new code.
-- Safe to re-run: every operation is conditional (IF NOT EXISTS).

-- ─── Enum values ─────────────────────────────────────────────────
-- Postgres lets you ADD VALUE to an enum if not already present.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ─── New columns ─────────────────────────────────────────────────
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "paymentReference"  TEXT,
  ADD COLUMN IF NOT EXISTS "customerNote"      TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceNumber"     TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceIssuedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invoiceUrl"        TEXT,
  ADD COLUMN IF NOT EXISTS "approvedByEmail"   TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"        TIMESTAMP(3);

-- Uniqueness on paymentReference (one-to-one with order)
CREATE UNIQUE INDEX IF NOT EXISTS "Order_paymentReference_key"
  ON "Order"("paymentReference")
  WHERE "paymentReference" IS NOT NULL;

-- Uniqueness on invoiceNumber (sequential identifier)
CREATE UNIQUE INDEX IF NOT EXISTS "Order_invoiceNumber_key"
  ON "Order"("invoiceNumber")
  WHERE "invoiceNumber" IS NOT NULL;

-- ─── Admin settings (singleton) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "AdminSettings" (
  "id"                TEXT        PRIMARY KEY DEFAULT 'default',
  "bankBeneficiary"   TEXT,
  "bankAddress"       TEXT,
  "bankVat"           TEXT,
  "bankName"          TEXT,
  "bankIban"          TEXT,
  "bankBic"           TEXT,
  "bankNotice"        TEXT,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedByEmail"    TEXT
);
