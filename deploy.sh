#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════"
echo "v32-CLEAN — deploy script"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Cosa fa questo script:"
echo "  1. Backup .env"
echo "  2. Aggiorna DATABASE_URL e DIRECT_URL su .env locale"
echo "     (con connect_timeout=15 per gestire Neon cold start)"
echo "  3. Sostituisce file: lib/r2.ts, app/api/upload/route.ts,"
echo "     app/api/team/[code]/route.ts, middleware.ts, lib/prisma.ts,"
echo "     vercel.json, package.json"
echo "  4. Cancella scripts/migrate-worker-kv.ts (non serve piu')"
echo "  5. npm install (rimuove AWS SDK, installa aws4fetch)"
echo "  6. npx prisma generate"
echo "  7. Aggiorna env vars su Vercel (DATABASE_URL e DIRECT_URL"
echo "     con connect_timeout=15)"
echo "  8. git commit + git push -> Vercel deploy automatico"
echo ""
echo "Premi INVIO per continuare, Ctrl+C per annullare."
read -r _

# --- Build clean DB URLs with connect_timeout ---
USER_NAME='neondb_owner'
PASS='npg_5GUdcqCY8Pwm'
HOSTBASE='ep-winter-firefly-al2xmhd9'
HOST_DOMAIN='c-3.eu-central-1.aws.neon.tech'
DB='neondb'
PARAMS='sslmode=require&channel_binding=require&connect_timeout=15&pool_timeout=15'

DBURL="postgresql://${USER_NAME}:${PASS}@${HOSTBASE}-pooler.${HOST_DOMAIN}/${DB}?${PARAMS}"
DRURL="postgresql://${USER_NAME}:${PASS}@${HOSTBASE}.${HOST_DOMAIN}/${DB}?sslmode=require&channel_binding=require"

if echo "$DBURL" | grep -qE '\[|mailto'; then
  echo "ERRORE INTERNO: URL build corrotto"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 1/8: backup .env"
echo "═══════════════════════════════════════════════════════════"
TS=$(date +%s)
cp .env .env.bak.${TS}
echo "  Backup: .env.bak.${TS}"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 2/8: fix .env locale (DATABASE_URL + DIRECT_URL)"
echo "═══════════════════════════════════════════════════════════"
python3 - "$DBURL" "$DRURL" <<'PYEOF'
import re, sys
db, dr = sys.argv[1], sys.argv[2]
with open('.env') as f: c = f.read()
c = re.sub(r'^DATABASE_URL=.*$', f'DATABASE_URL="{db}"', c, flags=re.MULTILINE)
c = re.sub(r'^DIRECT_URL=.*$', f'DIRECT_URL="{dr}"', c, flags=re.MULTILINE)
with open('.env','w') as f: f.write(c)
PYEOF
echo "  OK"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 3/8: copia nuovi file"
echo "═══════════════════════════════════════════════════════════"
mkdir -p app/api/team/\[code\] app/api/upload lib
cp -v _v32_payload/lib/r2.ts lib/r2.ts
cp -v _v32_payload/lib/prisma.ts lib/prisma.ts
cp -v _v32_payload/middleware.ts middleware.ts
cp -v _v32_payload/vercel.json vercel.json
cp -v _v32_payload/package.json package.json
cp -v _v32_payload/app/api/upload/route.ts app/api/upload/route.ts
cp -v "_v32_payload/app/api/team/[code]/route.ts" "app/api/team/[code]/route.ts"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 4/8: cancella scripts/migrate-worker-kv.ts"
echo "═══════════════════════════════════════════════════════════"
rm -fv scripts/migrate-worker-kv.ts || true

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 5/8: npm install (rimuove AWS SDK, installa aws4fetch)"
echo "═══════════════════════════════════════════════════════════"
rm -rf node_modules/.package-lock.json
npm install
echo "  OK"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 6/8: npx prisma generate"
echo "═══════════════════════════════════════════════════════════"
npx prisma generate
echo "  OK"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 7/8: aggiorna env vars su Vercel"
echo "═══════════════════════════════════════════════════════════"

if command -v vercel >/dev/null 2>&1; then
  VC="vercel"
elif command -v npx >/dev/null 2>&1; then
  VC="npx --yes vercel"
else
  echo "ERRORE: ne' vercel ne' npx trovati"
  exit 1
fi

for env in production preview development; do
  $VC env rm DATABASE_URL $env --yes 2>&1 || echo "  (rm DATABASE_URL $env: not present, ok)"
  $VC env rm DIRECT_URL $env --yes 2>&1 || echo "  (rm DIRECT_URL $env: not present, ok)"
done

# Add only to production (preview/development chiedono branch, skippiamo)
printf '%s' "$DBURL" | $VC env add DATABASE_URL production
printf '%s' "$DRURL" | $VC env add DIRECT_URL production

echo "  OK"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 8/8: git commit + push"
echo "═══════════════════════════════════════════════════════════"
git add -A
git commit -m "v32-clean: aws4fetch, maxDuration, connect_timeout, no Worker rewrite" || echo "  (nothing to commit)"
git push

# cleanup
rm -rf _v32_payload

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "FATTO!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Vercel sta facendo build (60-90s). Quando torna verde, testa:"
echo ""
echo "  curl -i --max-time 30 https://business.perenne.app/api/team/STLV"
echo ""
echo "Atteso: HTTP/2 404 in 1-3 secondi (cold start) o <500ms (warm)."
echo ""
