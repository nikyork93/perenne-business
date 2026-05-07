#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════"
echo "v34 — Codes session 2: bulk + CSV + email + revoke/restore"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Cosa fa:"
echo "  1. Nuovo /api/codes/bulk-assign (assegna N codici a N email"
echo "     in una transazione, da CSV o lista)"
echo "  2. Nuovo /api/codes/distribute (manda email Resend ai codici"
echo "     assegnati, traccia in EmailLog)"
echo "  3. Nuovo /api/codes/[id]/revoke (revoca codice)"
echo "  4. Nuovo /api/codes/[id]/restore (ripristina codice revocato)"
echo "  5. Nuovo lib/code-email-template.ts (template email codice)"
echo "  6. Aggiornata CodesTable: checkbox selezione, filtro batch,"
echo "     bottone Import CSV, bottone Send emails, Revoke/Restore"
echo ""
echo "Premi INVIO per continuare, Ctrl+C per annullare."
read -r _

echo "═══════════════════════════════════════════════════════════"
echo "STEP 1/3: copia file"
echo "═══════════════════════════════════════════════════════════"
mkdir -p lib components
mkdir -p app/api/codes/bulk-assign
mkdir -p app/api/codes/distribute
mkdir -p app/api/codes/\[id\]/revoke
mkdir -p app/api/codes/\[id\]/restore

cp -v _v34_payload/lib/code-email-template.ts lib/code-email-template.ts
cp -v _v34_payload/components/CodesTable.tsx components/CodesTable.tsx
cp -v _v34_payload/app/api/codes/bulk-assign/route.ts app/api/codes/bulk-assign/route.ts
cp -v _v34_payload/app/api/codes/distribute/route.ts app/api/codes/distribute/route.ts
cp -v "_v34_payload/app/api/codes/[id]/revoke/route.ts" "app/api/codes/[id]/revoke/route.ts"
cp -v "_v34_payload/app/api/codes/[id]/restore/route.ts" "app/api/codes/[id]/restore/route.ts"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 2/3: cleanup payload"
echo "═══════════════════════════════════════════════════════════"
rm -rf _v34_payload

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 3/3: git commit + push"
echo "═══════════════════════════════════════════════════════════"
git add -A
git commit -m "v34: codes bulk-assign + distribute + revoke/restore + CSV import"
git push

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "FATTO! Vercel deploy ~60-90s."
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Test post-deploy (dopo che v33 e' gia' deployato):"
echo ""
echo "  1. Vai a /codes -> vedi nuovi bottoni 'Import CSV' e 'Send emails'"
echo "  2. Click 'Import CSV' -> incolla:"
echo "       email,name"
echo "       test1@example.com,Mario"
echo "       test2@example.com,Luisa"
echo "     -> Click 'Assign codes' -> vedi 2 codici assegnati"
echo "  3. Seleziona checkbox sui codici assegnati"
echo "  4. Click 'Send emails' -> conferma -> dovrebbe mostrare 'sent: 2'"
echo "     (in dev senza RESEND_API_KEY logga in console di Vercel)"
echo "  5. Test Revoke su un codice -> dovrebbe diventare REVOKED"
echo "  6. Test Restore sullo stesso -> torna AVAILABLE"
echo ""
