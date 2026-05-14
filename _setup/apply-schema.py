#!/usr/bin/env python3
"""
Merge AdminSettings + AnalyticsSnapshot models into prisma/schema.prisma.

Idempotent: removes any existing definitions of these two models and
re-appends the full versions, so running this twice gives the same result.

Run from repo root: python3 _setup/apply-schema.py
"""
import re
import sys
import os

SCHEMA_PATH = 'prisma/schema.prisma'

# Final, complete versions (after Batch D + E)
NEW_BLOCKS = """

// ─── Admin settings (singleton) ─────────────────────────────────
//
// Holds platform-wide configuration that's not tied to any specific
// company: bank-transfer coordinates shown to customers + analytics
// integration credentials. Single row identified by id = "default".
model AdminSettings {
  id                  String   @id @default("default")

  // Bank transfer coordinates shown to customers at checkout
  bankBeneficiary     String?
  bankAddress         String?
  bankVat             String?
  bankName            String?
  bankIban            String?
  bankBic             String?
  bankNotice          String?

  // App Store Connect API credentials (Sales Reports)
  asc_keyId           String?
  asc_issuerId        String?
  asc_privateKey      String?       // P8 private key contents (multi-line PEM)
  asc_appId           String?       // numeric SKU id, e.g. "6758993077"
  asc_vendorId        String?       // 8/9-digit vendor id for sales reports
  asc_lastSyncAt      DateTime?

  // Firebase / GA4 Analytics
  fb_serviceAccountJson String?
  fb_propertyId         String?
  fb_lastSyncAt         DateTime?

  updatedAt           DateTime @updatedAt
  updatedByEmail      String?
}

// Cache for daily analytics rows pulled from App Store Connect or
// Firebase. Upserted by (source, metric, date) so re-syncing is safe.
model AnalyticsSnapshot {
  id          String   @id @default(cuid())
  source      String   // "asc" | "firebase"
  metric      String   // "installs" | "revenue" | "dau" | "new_users" | "event_count"
  date        DateTime @db.Date
  value       Float
  currency    String?
  metadata    Json?
  fetchedAt   DateTime @default(now())

  @@unique([source, metric, date], name: "source_metric_date")
  @@index([source, date])
}
"""


def strip_existing_model(content: str, model_name: str) -> str:
    """Remove a `model Foo { ... }` block, with brace matching."""
    pattern = rf'(\n//[^\n]*\n)*\s*model\s+{re.escape(model_name)}\s*\{{'
    m = re.search(pattern, content)
    if not m:
        return content
    start = m.start()
    # Find matching closing brace
    i = m.end()
    depth = 1
    while i < len(content) and depth > 0:
        ch = content[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
        i += 1
    if depth != 0:
        print(f"WARN: unbalanced braces while stripping model {model_name}, skipping")
        return content
    end = i
    # Also drop trailing newline if present
    if end < len(content) and content[end] == '\n':
        end += 1
    return content[:start] + content[end:]


def main():
    if not os.path.exists(SCHEMA_PATH):
        print(f"ERROR: {SCHEMA_PATH} not found. Run this script from the repo root.")
        sys.exit(1)

    with open(SCHEMA_PATH, 'r') as f:
        content = f.read()

    # Remove old versions if present
    for model in ('AdminSettings', 'AnalyticsSnapshot'):
        before = content
        content = strip_existing_model(content, model)
        if content != before:
            print(f"  · removed existing model {model}")

    # Trim trailing whitespace
    content = content.rstrip() + '\n'

    # Append the new blocks
    content += NEW_BLOCKS

    with open(SCHEMA_PATH, 'w') as f:
        f.write(content)

    print(f"  ✓ {SCHEMA_PATH} updated with AdminSettings + AnalyticsSnapshot")


if __name__ == '__main__':
    main()
