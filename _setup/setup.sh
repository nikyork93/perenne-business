#!/usr/bin/env bash
#
# Perenne Business — full deploy script for Batches C + D + E.
# Run from inside the repo root:
#
#   cd ~/Dropbox/Documenti/perenne-business
#   bash _setup/setup.sh
#
# What it does, in order:
#   1) Validate we're in the right repo
#   2) Install the `jose` npm package
#   3) Patch prisma/schema.prisma (AdminSettings + AnalyticsSnapshot)
#   4) Run two SQL migrations against your live Neon DB via `prisma db execute`
#   5) Regenerate the Prisma client
#   6) Stage + commit + push to GitHub (Vercel auto-deploys)
#
# Idempotent — safe to re-run if something fails partway.

set -e  # bail on the first error
set -o pipefail

# ──────────────────────────────────────────────────────────────────
# 1) Sanity check — we should be in the perenne-business repo
# ──────────────────────────────────────────────────────────────────
echo ""
echo "─── Perenne Business · full deploy ──────────────"
echo ""

if [ ! -f "package.json" ] || ! grep -q '"perenne-business"' package.json; then
  echo "✗ Run this from the perenne-business repo root."
  echo "  Try: cd ~/Dropbox/Documenti/perenne-business"
  exit 1
fi

if [ ! -f ".env" ] && [ ! -f ".env.local" ]; then
  echo "✗ No .env or .env.local found. DATABASE_URL is required for migrations."
  exit 1
fi

echo "✓ Repo OK"

# ──────────────────────────────────────────────────────────────────
# 2) Install jose (used by analytics integrations)
# ──────────────────────────────────────────────────────────────────
echo ""
echo "─── Installing dependencies ─────────────────────"
if ! grep -q '"jose"' package.json; then
  npm install jose
else
  echo "  · jose already present"
fi

# ──────────────────────────────────────────────────────────────────
# 3) Patch schema.prisma
# ──────────────────────────────────────────────────────────────────
echo ""
echo "─── Patching prisma/schema.prisma ───────────────"
python3 _setup/apply-schema.py

# ──────────────────────────────────────────────────────────────────
# 4) Run SQL migrations against Neon
# ──────────────────────────────────────────────────────────────────
echo ""
echo "─── Running database migrations ─────────────────"

# Note: ALTER TYPE ... ADD VALUE on Postgres cannot run inside a
# transaction block. `prisma db execute` runs the file as a script
# without an enclosing transaction, so the IF NOT EXISTS guards make
# re-runs safe.
echo "  · manual_order_flow.sql"
npx prisma db execute --file prisma/migrations/manual_order_flow.sql --schema prisma/schema.prisma

echo "  · analytics_integration.sql"
npx prisma db execute --file prisma/migrations/analytics_integration.sql --schema prisma/schema.prisma

echo "  ✓ All migrations applied"

# ──────────────────────────────────────────────────────────────────
# 5) Regenerate Prisma client so the new fields are typed
# ──────────────────────────────────────────────────────────────────
echo ""
echo "─── Regenerating Prisma client ──────────────────"
npx prisma generate

# ──────────────────────────────────────────────────────────────────
# 6) Commit + push
# ──────────────────────────────────────────────────────────────────
echo ""
echo "─── Committing + pushing ────────────────────────"

git --no-pager status --short
echo ""

git add .
git commit -m "codes/distribution/store/admin: full B2B flow upgrade (Batches C+D+E)

- Codes: single-send action + 'Sent' / 'Sent in batch' badges
- Distribution: manual email mode alongside CSV upload
- Store: manual order flow with bank wire instructions popup
- Billing: invoice numbers + printable HTML invoice download
- Admin: orders review queue + platform settings (bank details, ASC creds, Firebase creds)
- Analytics: App Store Connect + Firebase Analytics dashboards
- Schema: AdminSettings singleton + AnalyticsSnapshot cache table"

git push

echo ""
echo "──────────────────────────────────────────────────"
echo "✓ All done. Vercel is now deploying."
echo "  Once live:"
echo "    1) Go to /admin/settings → Bank transfer tab → fill in your bank details"
echo "    2) Go to /admin/settings → App Store Connect tab → paste your API key"
echo "    3) Go to /admin/settings → Firebase tab → paste your service account JSON"
echo "    4) Visit /admin/analytics and click 'Sync all' to pull data"
echo "──────────────────────────────────────────────────"
