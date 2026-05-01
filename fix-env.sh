#!/usr/bin/env bash
set -e

# ─────────────────────────────────────────────────────────────────
# Fix DATABASE_URL and DIRECT_URL on .env (local) and on Vercel.
# Strings are built from components inside this script so no
# markdown corruption can sneak in via copy-paste.
# ─────────────────────────────────────────────────────────────────

cd "$(dirname "$0")"

USER_NAME='neondb_owner'
PASS='npg_5GUdcqCY8Pwm'
HOSTBASE='ep-winter-firefly-al2xmhd9'
HOST_DOMAIN='c-3.eu-central-1.aws.neon.tech'
DB='neondb'
PARAMS='sslmode=require&channel_binding=require'

DBURL="postgresql://${USER_NAME}:${PASS}@${HOSTBASE}-pooler.${HOST_DOMAIN}/${DB}?${PARAMS}"
DRURL="postgresql://${USER_NAME}:${PASS}@${HOSTBASE}.${HOST_DOMAIN}/${DB}?${PARAMS}"

echo "═══════════════════════════════════════════════════"
echo "Built URLs (verify no '[' or 'mailto' below):"
echo "═══════════════════════════════════════════════════"
echo "POOLED: ${DBURL}"
echo "DIRECT: ${DRURL}"
echo ""

# Sanity check
if echo "$DBURL" | grep -q '\['; then
  echo "✗ ERROR: built URL contains '[' — aborting"
  exit 1
fi
if echo "$DBURL" | grep -q 'mailto'; then
  echo "✗ ERROR: built URL contains 'mailto' — aborting"
  exit 1
fi
echo "✓ Built URLs are clean"
echo ""

# Backup .env
TS=$(date +%s)
cp .env .env.bak.${TS}
echo "✓ Backup saved as .env.bak.${TS}"
echo ""

# Fix .env using Python for robust string handling
python3 - "$DBURL" "$DRURL" <<'PYEOF'
import re, sys
db, dr = sys.argv[1], sys.argv[2]
with open('.env') as f: c = f.read()
c = re.sub(r'^DATABASE_URL=.*$', f'DATABASE_URL="{db}"', c, flags=re.MULTILINE)
c = re.sub(r'^DIRECT_URL=.*$', f'DIRECT_URL="{dr}"', c, flags=re.MULTILINE)
with open('.env','w') as f: f.write(c)
PYEOF

# Verify .env is clean
if grep -E '^(DATABASE_URL|DIRECT_URL)=' .env | grep -q '\['; then
  echo "✗ ERROR: .env still has '[' — restoring backup"
  cp .env.bak.${TS} .env
  exit 1
fi

echo "✓ .env fixed locally"
echo ""
echo "Local .env now contains:"
grep -E '^(DATABASE_URL|DIRECT_URL)=' .env
echo ""

# ─────────────────────────────────────────────────────────────────
# Now fix Vercel env vars via CLI
# ─────────────────────────────────────────────────────────────────

if ! command -v vercel >/dev/null 2>&1; then
  echo "✗ vercel CLI not found. Install with: npm i -g vercel"
  exit 1
fi

echo "═══════════════════════════════════════════════════"
echo "Removing OLD Vercel env vars (broken markdown)..."
echo "═══════════════════════════════════════════════════"
vercel env rm DATABASE_URL production --yes 2>&1 || echo "  (DATABASE_URL production not present, ok)"
vercel env rm DATABASE_URL preview --yes 2>&1 || echo "  (DATABASE_URL preview not present, ok)"
vercel env rm DATABASE_URL development --yes 2>&1 || echo "  (DATABASE_URL development not present, ok)"
vercel env rm DIRECT_URL production --yes 2>&1 || echo "  (DIRECT_URL production not present, ok)"
vercel env rm DIRECT_URL preview --yes 2>&1 || echo "  (DIRECT_URL preview not present, ok)"
vercel env rm DIRECT_URL development --yes 2>&1 || echo "  (DIRECT_URL development not present, ok)"
echo ""

echo "═══════════════════════════════════════════════════"
echo "Adding CLEAN Vercel env vars..."
echo "═══════════════════════════════════════════════════"
printf '%s' "$DBURL" | vercel env add DATABASE_URL production
printf '%s' "$DBURL" | vercel env add DATABASE_URL preview
printf '%s' "$DBURL" | vercel env add DATABASE_URL development
printf '%s' "$DRURL" | vercel env add DIRECT_URL production
printf '%s' "$DRURL" | vercel env add DIRECT_URL preview
printf '%s' "$DRURL" | vercel env add DIRECT_URL development
echo ""
echo "✓ Vercel env vars updated"
echo ""

# ─────────────────────────────────────────────────────────────────
# Force redeploy
# ─────────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════"
echo "Forcing redeploy..."
echo "═══════════════════════════════════════════════════"
git commit --allow-empty -m 'fix: clean DATABASE_URL and DIRECT_URL on env'
git push
echo ""
echo "✓ Pushed."
echo ""

echo "═══════════════════════════════════════════════════"
echo "DONE!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Wait ~60-90s for Vercel deploy to finish, then run:"
echo ""
echo "  curl -i --max-time 10 https://business.perenne.app/api/team/STLV"
echo ""
echo "Expected: HTTP/2 404 in <500ms (no more timeout)"
echo ""
