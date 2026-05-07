#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════"
echo "v35 — UI fixes + invert color rewrite"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Fix:"
echo "  1. Login: forza dark theme (data-theme=dark) cosi i testi"
echo "     restano leggibili anche con sistema in light mode"
echo "  2. Invert color: rewrite con canvas2D manuale (bypassa il"
echo "     limite WebGL maxTextureSize 2048 di Fabric)"
echo "  3. Default opacity buttons: ora applicano l'opacita anche"
echo "     al watermark selezionato (oltre a impostarla per i nuovi)"
echo "  4. DesignThumbnail: spread piu' grande (200px vs 140), con"
echo "     frame leggero e ombra"
echo "  5. Pagine /codes /admin/codes /admin/codes/new: ora usano"
echo "     PageHeader (font-display italic) coerente con resto app"
echo "  6. Modal backdrop-blur + token coerenti (no più bg-surface-1)"
echo ""
echo "Premi INVIO per continuare, Ctrl+C per annullare."
read -r _

echo "═══════════════════════════════════════════════════════════"
echo "STEP 1/2: copia file"
echo "═══════════════════════════════════════════════════════════"
mkdir -p app/login app/codes app/admin/codes app/admin/codes/new
mkdir -p components/editor components/designs components/admin

cp -v _v35_payload/app/login/page.tsx app/login/page.tsx
cp -v _v35_payload/app/codes/page.tsx app/codes/page.tsx
cp -v _v35_payload/app/admin/codes/page.tsx app/admin/codes/page.tsx
cp -v _v35_payload/app/admin/codes/new/page.tsx app/admin/codes/new/page.tsx
cp -v _v35_payload/components/editor/CoverEditor.tsx components/editor/CoverEditor.tsx
cp -v _v35_payload/components/editor/PageEditor.tsx components/editor/PageEditor.tsx
cp -v _v35_payload/components/designs/DesignThumbnail.tsx components/designs/DesignThumbnail.tsx
cp -v _v35_payload/components/designs/DesignsList.tsx components/designs/DesignsList.tsx
cp -v _v35_payload/components/admin/NewBatchForm.tsx components/admin/NewBatchForm.tsx
cp -v _v35_payload/components/CodesTable.tsx components/CodesTable.tsx

rm -rf _v35_payload

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 2/2: git commit + push"
echo "═══════════════════════════════════════════════════════════"
git add -A
git commit -m "v35: invert canvas2d + opacity buttons + page typography + modal blur"
git push

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "FATTO! Aspetta deploy verde su Vercel."
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Test:"
echo "  1. Login: testi e logo bianchi ben leggibili"
echo "  2. Editor cover: carica logo wide (es STELVIO collection),"
echo "     click Invert -> il logo COMPLETO diventa bianco"
echo "  3. Editor pagina: seleziona un watermark, click 10/20/30/50%"
echo "     -> opacità del watermark cambia istantaneamente"
echo "  4. /designs: griglia con thumbnail spread piu' grandi e curate"
echo "  5. /codes: titolo in font-display italic come le altre pagine"
echo "  6. /codes -> Import CSV / Send emails / Assign:"
echo "     dialog con backdrop blurrato e sfondo glass leggibile"
echo ""
