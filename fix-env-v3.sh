#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

USER_NAME='neondb_owner'
PASS='npg_5GUdcqCY8Pwm'
HOSTBASE='ep-winter-firefly-al2xmhd9'
HOST_DOMAIN='c-3.eu-central-1.aws.neon.tech'
DB='neondb'
PARAMS='sslmode=require&channel_binding=require'

DBURL="postgresql://${USER_NAME}:${PASS}@${HOSTBASE}-pooler.${HOST_DOMAIN}/${DB}?${PARAMS}"
DRURL="postgresql://${USER_NAME}:${PASS}@${HOSTBASE}.${HOST_DOMAIN}/${DB}?${PARAMS}"

# Sanity check
if echo "$DBURL" | grep -qE '\[|mailto'; then
  echo "ERRORE INTERNO: URL build corrotto"
  exit 1
fi

echo "=== Fix .env locale ==="
cp .env .env.bak.$(date +%s)
python3 - "$DBURL" "$DRURL" <<'PYEOF'
import re, sys
db, dr = sys.argv[1], sys.argv[2]
with open('.env') as f: c = f.read()
c = re.sub(r'^DATABASE_URL=.*$', f'DATABASE_URL="{db}"', c, flags=re.MULTILINE)
c = re.sub(r'^DIRECT_URL=.*$', f'DIRECT_URL="{dr}"', c, flags=re.MULTILINE)
with open('.env','w') as f: f.write(c)
PYEOF
echo "OK"
echo ""

# Decide which vercel command to use
if command -v vercel >/dev/null 2>&1; then
  VC="vercel"
elif command -v npx >/dev/null 2>&1; then
  VC="npx --yes vercel"
else
  echo "ERRORE: né vercel né npx trovati"
  exit 1
fi
echo "Uso: $VC"
echo ""

echo "=== Rimuovo env vars vecchie da Vercel ==="
for env in production preview development; do
  echo "  rm DATABASE_URL $env"
  $VC env rm DATABASE_URL $env --yes 2>&1 || echo "    (non presente, ok)"
  echo "  rm DIRECT_URL $env"
  $VC env rm DIRECT_URL $env --yes 2>&1 || echo "    (non presente, ok)"
done
echo ""

echo "=== Aggiungo env vars pulite su Vercel ==="
for env in production preview development; do
  echo "  add DATABASE_URL $env"
  printf '%s' "$DBURL" | $VC env add DATABASE_URL $env
  echo "  add DIRECT_URL $env"
  printf '%s' "$DRURL" | $VC env add DIRECT_URL $env
done
echo ""

echo "=== Force redeploy ==="
git commit --allow-empty -m 'fix: clean DATABASE_URL and DIRECT_URL on Vercel'
git push
echo ""

echo "=== FATTO ==="
echo ""
echo "Aspetta 60-90s che Vercel deployi, poi:"
echo "  curl -i --max-time 10 https://business.perenne.app/api/team/STLV"
echo ""
echo "Atteso: HTTP/2 404 in <500ms"
