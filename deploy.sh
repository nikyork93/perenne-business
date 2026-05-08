#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════"
echo "v37 — invert color (Canvas2D backend) + tab visibility recovery"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Approccio nuovo:"
echo "  1. INVERT: forza Canvas2dFilterBackend di Fabric (API ufficiale)"
echo "     prima di creare il canvas. Il backend WebGL aveva un cap di"
echo "     2048px che troncava i loghi larghi sul canvas live."
echo ""
echo "  2. LOGHI SCOLLEGATI nel cambio tab: nuovo helper"
echo "     recoverCanvasOnVisibility() che al ritorno della visibilita':"
echo "       - ricalcola dimensioni e offset del canvas"
echo "       - re-attacca asset eventualmente rimossi"
echo "       - rileva immagini 'evicted' dal browser (naturalWidth=0)"
echo "         e le ricarica da URL preservando posizione/scala/inversione"
echo "       - logga in console quanti reattach/reload ha fatto"
echo ""
echo "  Carry-over fix di v35 (login, design grid, modal, typography)."
echo ""
echo "Premi INVIO per continuare, Ctrl+C per annullare."
read -r _

echo "═══════════════════════════════════════════════════════════"
echo "STEP 1/2: copia file"
echo "═══════════════════════════════════════════════════════════"
mkdir -p lib app/login app/codes app/admin/codes app/admin/codes/new
mkdir -p components/editor components/designs components/admin

cp -v _v37_payload/lib/fabric-backend.ts lib/fabric-backend.ts
cp -v _v37_payload/components/editor/CoverEditor.tsx components/editor/CoverEditor.tsx
cp -v _v37_payload/components/editor/PageEditor.tsx components/editor/PageEditor.tsx
cp -v _v37_payload/app/login/page.tsx app/login/page.tsx
cp -v _v37_payload/app/codes/page.tsx app/codes/page.tsx
cp -v _v37_payload/app/admin/codes/page.tsx app/admin/codes/page.tsx
cp -v _v37_payload/app/admin/codes/new/page.tsx app/admin/codes/new/page.tsx
cp -v _v37_payload/components/designs/DesignThumbnail.tsx components/designs/DesignThumbnail.tsx
cp -v _v37_payload/components/designs/DesignsList.tsx components/designs/DesignsList.tsx
cp -v _v37_payload/components/admin/NewBatchForm.tsx components/admin/NewBatchForm.tsx
cp -v _v37_payload/components/CodesTable.tsx components/CodesTable.tsx

rm -rf _v37_payload

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 2/2: git commit + push"
echo "═══════════════════════════════════════════════════════════"
git add -A
git commit -m "v37: Canvas2D filter backend + visibility recovery (invert + asset reload)"
git push

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "FATTO!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Dopo deploy verde + HARD REFRESH (Cmd+Shift+R):"
echo ""
echo "TEST INVERT:"
echo "  1. Editor cover: carica un logo wide (es STELVIO collection)"
echo "  2. Click 'Invert color'"
echo "  3. Console deve mostrare:"
echo "     '[perenne] Fabric filterBackend → Canvas2dFilterBackend'"
echo "  4. Il logo INTERO deve diventare bianco, niente troncamenti"
echo ""
echo "TEST TAB VISIBILITY:"
echo "  1. Editor: carica 1-2 watermark nel tab Pages"
echo "  2. Vai su Cover, fai qualcosa, torna su Pages"
echo "  3. I watermark DEVONO essere visibili sul canvas"
echo "  4. Console deve mostrare:"
echo "     '[PageEditor] visibility recovery: reattached=X reloaded=Y'"
echo "     (se ha dovuto fare qualcosa)"
echo "  5. Stesso test al contrario (Cover -> Pages -> Cover)"
echo "  6. Se ancora succede, mandami screenshot della console di Chrome"
echo "     per debug — i log diranno esattamente cosa sta succedendo"
echo ""
