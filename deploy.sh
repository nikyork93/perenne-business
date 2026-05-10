#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════"
echo "v44 — Redeem legge anche NotebookCode.designId"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Cosa fa:"
echo "  1. POST /api/team/[code]/redeem ora risolve il design da"
echo "     TRE fonti, in priorita':"
echo "     - NotebookCode.design (codici manuali via /admin/codes)"
echo "     - Order.designSnapshotJson (codici Stripe)"
echo "     - Order.design (fallback)"
echo "     Cosi' i codici manuali con designId esplicito ritornano il"
echo "     design correttamente, niente piu' design:null."
echo ""
echo "  2. NUOVO endpoint POST /api/admin/codes/assign-design"
echo "     Permette di legare retroattivamente un Design a:"
echo "     - un singolo codice (per code)"
echo "     - un intero batch (per batchLabel)"
echo "     Usato per riparare codici creati senza design."
echo ""
echo "Premi INVIO, Ctrl+C per annullare."
read -r _

mkdir -p "app/api/team/[code]/redeem"
mkdir -p "app/api/admin/codes/assign-design"

cp -v "_v44_payload/app/api/team/[code]/redeem/route.ts" "app/api/team/[code]/redeem/route.ts"
cp -v "_v44_payload/app/api/admin/codes/assign-design/route.ts" "app/api/admin/codes/assign-design/route.ts"

rm -rf _v44_payload

git add -A
git commit -m "v44: redeem reads NotebookCode.designId + admin endpoint to assign design retroactively"
git push

echo ""
echo "FATTO. Aspetta deploy verde."
