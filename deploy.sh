#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════"
echo "v39 — Designs grid: snapshot fedele + responsive"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Cosa fa:"
echo "  1. DesignThumbnail RISCRITTO da zero:"
echo "     - Renderizza TUTTI gli asset salvati (cover + page),"
echo "       non solo il primario, con loro x/y/scala/rotazione/"
echo "       opacity/inversione esatti"
echo "     - Cover panel: colore + bg image salvati"
echo "     - Page panel: paper off-white + pattern dots fisso"
echo "     - Aspect-ratio CSS, niente piu' larghezze fisse in px"
echo "     - Width fluida che si adatta alla card → niente overflow"
echo "     - Cover e page separati visivamente: gap 4%, ombre"
echo "       individuali, paper pattern distinguibile dalla cover"
echo "     - Misura naturalWidth dell'immagine on-load per render"
echo "       fedele dello scale (proporzioni come nell'editor)"
echo ""
echo "  2. types.ts: aggiunti coverAssets[] e pageWatermarks[] ai"
echo "     DesignSummaryWithThumb. primaryAssetUrl/Watermark ora"
echo "     deprecati ma kept per back-compat."
echo ""
echo "  3. app/designs/page.tsx: nuovo extractAssetArray() che"
echo "     sanitizza il JSON DB in CoverAssetRef[] sicuro per il"
echo "     client. Mapping designs invia gli array completi."
echo ""
echo "Bug-hunt fatto: nessun altro callsite usa primaryAssetUrl/"
echo "DesignSummaryWithThumb in modo non compatibile."
echo ""
echo "Premi INVIO per continuare, Ctrl+C per annullare."
read -r _

echo "═══════════════════════════════════════════════════════════"
echo "STEP 1/2: copia file"
echo "═══════════════════════════════════════════════════════════"
mkdir -p components/designs app/designs

cp -v _v39_payload/components/designs/types.ts components/designs/types.ts
cp -v _v39_payload/components/designs/DesignThumbnail.tsx components/designs/DesignThumbnail.tsx
cp -v _v39_payload/components/designs/DesignsList.tsx components/designs/DesignsList.tsx
cp -v _v39_payload/app/designs/page.tsx app/designs/page.tsx

rm -rf _v39_payload

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 2/2: git commit + push"
echo "═══════════════════════════════════════════════════════════"
git add -A
git commit -m "v39: design library thumbnails — full snapshot + responsive layout"
git push

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "FATTO!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Test post-deploy + hard-refresh (Cmd+Shift+R):"
echo ""
echo "  1. Vai a /designs:"
echo "     - card non strabordano piu' a viewport stretto"
echo "     - cover usa il colore salvato (es #2c2c2e)"
echo "     - page mostra paper off-white con pattern dots visibile"
echo "     - tutti gli asset cover salvati (logo + altri) appaiono"
echo "       nelle posizioni corrette"
echo "     - tutti i page watermark appaiono nelle posizioni corrette"
echo "     - cover e page hanno ognuno la propria ombra → si"
echo "       capisce subito che e' un libro aperto"
echo ""
echo "  2. Apri un design, sposta un logo, salva, torna a /designs:"
echo "     - il thumbnail rispecchia la nuova posizione"
echo ""
echo "  3. Ridimensiona finestra browser fino a mobile width:"
echo "     - card si stringe, contenuto si stringe in proporzione"
echo "     - nessun overflow"
echo ""
