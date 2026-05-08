#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════"
echo "v38 — Perenne logo nelle email codice"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Cosa fa:"
echo "  1. Nuovo endpoint pubblico /api/brand/perenne-logo che serve"
echo "     l'SVG (variant=extended|symbol, color custom). Cache 1y."
echo "     Accessibile da qualsiasi client email come <img src>."
echo ""
echo "  2. Email template ora ha:"
echo "     - HEADER: logo 'Perenne note' wordmark sopra il greeting"
echo "     - FOOTER: micro-symbol P + 'THE PERENNE TEAM' (mono)"
echo "     - Testo body rinforzato: 'Perenne Note' bold dove citato"
echo ""
echo "  3. Endpoint distribute ora passa l'origin reale al template,"
echo "     cosi' funziona anche su preview deploy (non solo prod)"
echo ""
echo "Premi INVIO per continuare, Ctrl+C per annullare."
read -r _

echo "═══════════════════════════════════════════════════════════"
echo "STEP 1/2: copia file"
echo "═══════════════════════════════════════════════════════════"
mkdir -p lib
mkdir -p app/api/brand/perenne-logo
mkdir -p app/api/codes/distribute

cp -v _v38_payload/lib/code-email-template.ts lib/code-email-template.ts
cp -v _v38_payload/app/api/brand/perenne-logo/route.ts app/api/brand/perenne-logo/route.ts
cp -v _v38_payload/app/api/codes/distribute/route.ts app/api/codes/distribute/route.ts

rm -rf _v38_payload

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 2/2: git commit + push"
echo "═══════════════════════════════════════════════════════════"
git add -A
git commit -m "v38: Perenne logo in code distribution emails + public brand SVG endpoint"
git push

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "FATTO!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Test:"
echo "  1. Apri https://business.perenne.app/api/brand/perenne-logo"
echo "     -> dovresti vedere il wordmark 'Perenne note' nero su sfondo"
echo "        bianco (variant=extended di default)"
echo "  2. Prova https://business.perenne.app/api/brand/perenne-logo?variant=symbol&color=4a7a8c"
echo "     -> dovresti vedere il simbolo P in teal"
echo "  3. Vai a /codes -> seleziona codici assegnati -> Send emails"
echo "     -> apri email -> Perenne wordmark in alto + simbolo nel footer"
echo "     -> in Gmail web potrebbe servire 'Show images' la prima volta"
echo ""
