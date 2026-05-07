#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════"
echo "v33 — Codes system + invert color fix"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Cosa fa:"
echo "  1. Schema Prisma: NotebookCode supporta orderId NULL +"
echo "     designId diretto + batchLabel + assignedAt"
echo "  2. Nuovo /api/admin/codes/batch (superadmin crea batch)"
echo "  3. Nuovo /api/codes/[id]/assign (company assegna a email)"
echo "  4. Aggiornato /api/codes (filtra per batchLabel, ritorna designId diretto)"
echo "  5. Aggiornato /api/team/[code] (legge designId diretto da NotebookCode)"
echo "  6. Nuova pagina /admin/codes (lista batch superadmin)"
echo "  7. Nuova pagina /admin/codes/new (crea batch)"
echo "  8. Aggiornata pagina /codes (lista codici company + bottone Assign)"
echo "  9. Sidebar: aggiunta voce 'Code batches' in superadmin"
echo " 10. Bug invert color: fix in CoverEditor (objectCaching=false)"
echo ""
echo "Premi INVIO per continuare, Ctrl+C per annullare."
read -r _

echo "═══════════════════════════════════════════════════════════"
echo "STEP 1/5: copia file"
echo "═══════════════════════════════════════════════════════════"
mkdir -p prisma app/codes app/admin/codes app/admin/codes/new
mkdir -p app/api/admin/codes/batch
mkdir -p app/api/codes/\[id\]/assign
mkdir -p components/admin components/editor components/layout

cp -v _v33_payload/prisma/schema.prisma prisma/schema.prisma
cp -v _v33_payload/app/api/admin/codes/batch/route.ts app/api/admin/codes/batch/route.ts
cp -v "_v33_payload/app/api/codes/[id]/assign/route.ts" "app/api/codes/[id]/assign/route.ts"
cp -v _v33_payload/app/api/codes/route.ts app/api/codes/route.ts
cp -v "_v33_payload/app/api/team/[code]/route.ts" "app/api/team/[code]/route.ts"
cp -v _v33_payload/app/codes/page.tsx app/codes/page.tsx
cp -v _v33_payload/app/admin/codes/page.tsx app/admin/codes/page.tsx
cp -v _v33_payload/app/admin/codes/new/page.tsx app/admin/codes/new/page.tsx
cp -v _v33_payload/components/CodesTable.tsx components/CodesTable.tsx
cp -v _v33_payload/components/admin/NewBatchForm.tsx components/admin/NewBatchForm.tsx
cp -v _v33_payload/components/editor/CoverEditor.tsx components/editor/CoverEditor.tsx
cp -v _v33_payload/components/layout/Shell.tsx components/layout/Shell.tsx

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 2/5: prisma db push (applica schema su Neon)"
echo "═══════════════════════════════════════════════════════════"
npx prisma db push
echo "  OK"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 3/5: prisma generate (rebuild types)"
echo "═══════════════════════════════════════════════════════════"
npx prisma generate
echo "  OK"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 4/5: cleanup payload"
echo "═══════════════════════════════════════════════════════════"
rm -rf _v33_payload
echo "  OK"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 5/5: git commit + push"
echo "═══════════════════════════════════════════════════════════"
git add -A
git commit -m "v33: codes system (manual batches) + invert color fix"
git push

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "FATTO! Vercel sta facendo build (60-90s)."
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Test post-deploy:"
echo "  1. Login a business.perenne.app"
echo "  2. Vai a /admin/codes -> dovresti vedere lista vuota + bottone 'New batch'"
echo "  3. Click 'New batch':"
echo "     - Company: Stelvio Collection"
echo "     - Design: (qualsiasi tuo design, opzionale)"
echo "     - Number of codes: 5"
echo "     - Batch label: Test batch May 2026"
echo "     -> Submit"
echo "  4. Vai a /codes -> vedi 5 codici nuovi con il batch label"
echo "  5. Click 'Assign' su uno -> assegnalo a una mail di test"
echo "  6. Test API: curl https://business.perenne.app/api/team/<CODE>"
echo "     -> dovrebbe rispondere 200 con company + design snapshot"
echo ""
echo "Test bug invert color:"
echo "  1. Vai in editor di un design"
echo "  2. Carica logo STELVIO collection (il completo, ratio largo)"
echo "  3. Click Invert color"
echo "  4. Verifica che NON sia troncato a 'STEL collec'"
echo ""
