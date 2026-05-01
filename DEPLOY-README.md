# Design Library — UNIFIED DEPLOY (Session 1 + 2 + 3 + Debug)

Tutto quello che è stato fatto durante l'esperienza in macchina, raggruppato in un singolo deploy.

## Cosa fa questo deploy

**Backbone (Session 1 — schema + migration + API + dual-write)**
- Nuovo model `Design` + 2 colonne nullable su `Order` (`designId`, `designSnapshotJson`)
- Backfill one-shot che crea un Design "Default" per ogni Company esistente e snapshota gli Order pre-esistenti
- API CRUD completa `/api/designs/*` (list, create, get, update, archive/delete, duplicate, set-default)
- `/api/cover` legacy aggiornata a dual-write (continua a scrivere su `CoverConfig` per compat iOS attuale, e in parallelo aggiorna il `Design` default)
- `/api/checkout` accetta `designId` opzionale e snapshota nel `Order.designSnapshotJson` al PENDING

**UI library (Session 2)**
- Sidebar nav: "Cover" → "Designs"
- `/cover` redirect server-side a `/designs/[default]/edit` (backward compat per vecchi bookmark)
- `/designs` — pagina lista con thumbnail HTML/CSS, default badge, contatore ordini
- `/designs/new` — form di creazione (name + opzionale "copy from")
- `/designs/[id]/edit` — l'editor parametrizzato (sostituisce `/cover`)
- `EditorClient` esteso: accetta `designId`, dispatcha PATCH `/api/designs/[id]` con body parziali (saveCover non tocca pageWatermarks, e viceversa)
- `/store` con dropdown "Design for this batch"
- `/api/codes` ora include `designName` + `designArchived` dal parent order
- `CodesTable` mostra colonna Design

**iOS preparation (Session 3 — endpoint pronto, refactor iOS rimandato)**
- Nuovo endpoint internal `/api/internal/code-resolve/[code]` con auth HMAC che ritorna lo snapshot completo del design al Cloudflare Worker
- README dettagliato `SESSION-3-IOS-NOTES.md` su cosa serve fare lato Worker e iOS

**Debug fixes**
- Migration script: branch silenzioso fixato con error log esplicito
- EditorClient saveCover: non cancella più la quote esistente quando il body non la include
- VIEWER role: read-only enforcement nell'editor (save buttons disabilitati, upload bloccati)
- Type architecture: spostato `DesignSummaryWithThumb` da `app/` a `components/` per evitare import client→server-page

## Sequenza deploy (ORDINE CRITICO)

```bash
# 1. Estrai
cd ~/Dropbox/Documenti/perenne-business
tar -xzf ~/Downloads/perenne-design-full.tar.gz

# 2. Schema push (crea Design + colonne Order)
npx prisma db push

# 3. Rigenera client Prisma con i nuovi tipi
npx prisma generate

# 4. Dry-run del backfill — controlla cosa farà
npx tsx scripts/migrate-designs.ts --dry-run

# 5. Backfill vero (idempotente, safe da rilanciare)
npx tsx scripts/migrate-designs.ts

# 6. Commit & push (Vercel auto-deploya)
git add -A
git commit -m "Design library: schema + migration + UI + internal code-resolve endpoint"
git push

# 7. Pulisci
rm ~/Downloads/perenne-design-full.tar.gz
```

## Verifica post-deploy

### A — Database integrity (Neon SQL editor o psql)

```sql
-- Tutti gli order esistenti hanno snapshot?
SELECT COUNT(*) FROM "Order" WHERE "designSnapshotJson" IS NULL;
-- → deve essere 0

-- Ogni company ha esattamente UN default design?
SELECT "companyId", COUNT(*) FROM "Design"
WHERE "isDefault" = true
GROUP BY "companyId" HAVING COUNT(*) <> 1;
-- → vuoto (zero righe)

-- Quante righe Design totali?
SELECT COUNT(*) FROM "Design";
-- → uguale al numero di Company che avevano un CoverConfig
```

### B — UI smoke test

1. Apri `/designs` — deve mostrare almeno il design "Default" con thumbnail
2. Click su "Edit" → l'editor si apre, layout templates, save cover, save watermarks tutti funzionanti
3. Torna a `/designs` → click "+ New design" → form, crea "Test design"
4. Sei in `/designs/[id]/edit` per il nuovo design — modifica colore + carica un logo, save
5. Torna a `/designs` → vedi entrambi i design, "Default" con badge accent
6. Click "Set default" sul "Test design" → diventa default, "Default" perde il badge
7. Click "Duplicate" sul "Default" → si crea "Default copy"
8. Click "Delete" su "Default copy" (zero orders) → sparisce
9. Apri `/store` → dropdown design mostra entrambi i design, "Test design" pre-selezionato (è default)
10. Apri `/cover` (vecchio link) → redirect automatico a `/designs/[default]/edit`
11. Apri `/codes` — colonna "Design" mostra il design name del batch

### C — API smoke test

```bash
# Lista designs
curl https://business.perenne.app/api/designs \
  -H "Cookie: <your session cookie>"

# Internal code-resolve (con HMAC corretto)
TS=$(date +%s%3N)
SIG=$(node -e "console.log(require('crypto').createHmac('sha256',process.env.SEC).update(process.env.TS+':'+process.env.CODE).digest('base64url'))" \
  SEC=$PERENNE_API_SECRET TS=$TS CODE=PRN-XXXX-XXXX-XXXX)
curl -H "x-perenne-signature: $SIG" \
     -H "x-perenne-timestamp: $TS" \
     https://business.perenne.app/api/internal/code-resolve/PRN-XXXX-XXXX-XXXX
```

## Cosa FA e cosa NON FA questo deploy

✅ **FA**:
- Permette di creare/gestire design multipli per company
- Lega ogni Order al design scelto al checkout (snapshot frozen)
- Editing di un design NON cambia ordini già acquistati
- L'iOS continua a vedere il vecchio brand (zero regressione perché il Worker continua a leggere la KV legacy)
- Il nuovo endpoint `/api/internal/code-resolve` è già attivo e pronto per essere chiamato dal Worker

❌ **NON FA** (richiede Session 3.5 quando hai i file):
- L'iOS NON consuma ancora lo snapshot pieno — vede solo logo + colore (come prima)
- Il Cloudflare Worker NON è stato modificato — continua a usare la sua KV legacy
- I page watermarks NON sono ancora renderizzati su iOS

Per chiudere il cerchio servono:
1. Codice del Cloudflare Worker (repository separato — `api.perenne.app`)
2. `Perenne Note/Homepage/NotebookCover3D.swift` per estendere il rendering
3. Eventuali file Swift che renderizzano le pagine del notebook (per i watermark)

Vedi `SESSION-3-IOS-NOTES.md` per i dettagli.

## Rollback

Se qualcosa va storto post-deploy:

```bash
# 1. Revert del codice
git revert HEAD
git push

# 2. (Opzionale) Rollback dei dati
psql $DATABASE_URL <<EOF
UPDATE "Order" SET "designId" = NULL, "designSnapshotJson" = NULL;
DELETE FROM "Design";
EOF

# 3. (Opzionale) Rollback schema — torna alla versione vecchia di
# schema.prisma e rilancia:
npx prisma db push
```

Lo schema è puramente additivo (nuova tabella + colonne nullable), quindi `prisma db push` con lo schema vecchio droppa pulito senza data loss su CoverConfig/Order.

## File inclusi (24 totali)

```
prisma/
  schema.prisma                                            (Design model + 2 cols on Order)

scripts/
  migrate-designs.ts                                       (idempotent backfill)

types/
  design.ts                                                (Design, DesignSummary, DesignSnapshot)

lib/
  design.ts                                                (helpers: snapshot, default, dual-write)

app/api/designs/
  route.ts                                                 (GET list, POST create)
  [id]/route.ts                                            (GET, PATCH, DELETE)
  [id]/duplicate/route.ts                                  (POST duplicate)
  [id]/set-default/route.ts                                (POST set-default)

app/api/cover/route.ts                                     (LEGACY — now dual-writes)
app/api/checkout/route.ts                                  (now accepts designId, snapshots)
app/api/codes/route.ts                                     (now returns designName)
app/api/internal/code-resolve/[code]/route.ts              (NEW — for Worker)

app/cover/page.tsx                                         (redirect to /designs/[default]/edit)
app/designs/page.tsx                                       (library list)
app/designs/new/page.tsx                                   (create form)
app/designs/[id]/edit/page.tsx                             (parametrized editor)
app/store/page.tsx                                         (now passes designs to grid)

components/StoreGrid.tsx                                   (now has design dropdown)
components/CodesTable.tsx                                  (now has Design column)
components/editor/EditorClient.tsx                         (parametrized + readOnly)
components/layout/Shell.tsx                                (Cover → Designs in nav)

components/designs/
  types.ts                                                 (DesignSummaryWithThumb)
  DesignThumbnail.tsx                                      (HTML/CSS preview)
  DesignsList.tsx                                          (client list with actions)
  NewDesignForm.tsx                                        (client form)

SESSION-3-IOS-NOTES.md                                     (what's left to do for iOS/Worker)
DEPLOY-README.md                                           (this file)
```
