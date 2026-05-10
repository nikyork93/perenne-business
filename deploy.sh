#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════"
echo "v43 — Redeem endpoint a prova di hang"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Aggiunge:"
echo "  - Logging step-by-step visibile in Vercel Functions tab"
echo "  - Timeout 5s per query DB con Promise.race"
echo "  - maxDuration=30 (no kill silenzioso da Vercel)"
echo "  - 500 errore esplicito invece di hang infinito"
echo ""
echo "Premi INVIO, Ctrl+C per annullare."
read -r _

mkdir -p "app/api/team/[code]/redeem"
cp -v "_v43_payload/app/api/team/[code]/redeem/route.ts" "app/api/team/[code]/redeem/route.ts"

rm -rf _v43_payload

git add -A
git commit -m "v43: redeem endpoint with timeouts + step-by-step logging"
git push

echo ""
echo "FATTO. Aspetta deploy verde su Vercel."
echo ""
echo "Poi controlla i logs in tempo reale:"
echo "  https://vercel.com/<your-org>/perenne-business/logs"
echo "  oppure: vercel logs --follow"
echo ""
echo "Test:"
echo "  curl -i -X POST 'https://business.perenne.app/api/team/PRN-AZKP-32PJ/redeem' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"deviceId\":\"test-claude\"}' --max-time 30"
echo ""
echo "Se va in timeout di nuovo: copia i log Vercel e mandameli."
echo "I log mostrano esattamente dove la richiesta si blocca."
