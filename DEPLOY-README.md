# Design Library v28 — UNIFIED DEPLOY

Tutto in un singolo bundle: schema + migration + UI + bug fixes + code-delivery extension.

## Cosa fa questo deploy

**Backbone (Session 1)**
- Nuovo model `Design` + 2 colonne nullable su `Order` (`designId`, `designSnapshotJson`)
- Backfill one-shot crea Design "Default" per ogni Company esistente, snapshota gli Order pre-esistenti
- API CRUD `/api/designs/*` (list, create, get, update, archive/delete, duplicate, set-default, **rename**)
- `/api/cover` legacy dual-write (CoverConfig + Design default)
- `/api/checkout` accetta `designId` + snapshot al PENDING

**UI (Session 2)**
- Sidebar nav: "Cover" → "Designs"
- `/cover` redirect a `/designs/[default]/edit`
- `/designs` lista con thumbnail spread (cover + page), default badge, contatore ordini
- `/designs/new` form con "copy from"
- `/designs/[id]/edit` editor parametrizzato
- `/store` con dropdown "Design for this batch"
- `/api/codes` include `designName` + `designArchived`
- `CodesTable` mostra colonna Design

**Internal endpoint (Session 3)**
- `/api/internal/code-resolve/[code]` con HMAC per il Worker (alternativa al sync push)

**Code-to-iPad pipeline (Session 7)**
- Webhook Stripe esteso — invia design snapshot + company branding al `/codes/sync` Worker
- Patch Worker `handleCodesSync` v2 documentata (vedi `SESSION-7-CODE-DELIVERY.md`)
- Estensione Swift `TeamBrandConfig.DesignBlock.DesignSnapshot` documentata

**Bug fixes (questa sessione)**
- **Invert color** robusto: cache invalidation Fabric (`dirty=true`, `_element` reset, `cacheKey` rotation) — risolve "funziona solo sul primo asset"
- **Paper colors esatti iOS**: 4 invece di 8 — `#FDFBF7`, `#F5F5DC`, `#27272A`, `#1E293B` (identici a `CustomToolbar.swift`)
- **Pattern opacity ridotta del 20%**: line 0.08→0.064 / 0.25→0.20, dot 0.22→0.176 / 0.35→0.28
- **Spread view toggle** nel PageEditor (single/spread con icone, sessionStorage persisted)
- **Editable design name** inline nell'header `/designs/[id]/edit` (click-to-edit, Enter/Escape, Esc cancels)
- **Editable design name** inline nelle card di `/designs` (stesso componente, click sul nome non triggera navigation)
- **Grid view spread**: cover + page side-by-side via `mode="spread"` di `DesignThumbnail`
- **Opacity slider live**: `onInput` + `requestRenderAll` (era già fixato in v25 ma non deployato — ora incluso)

## Sequenza deploy (ORDINE CRITICO)

```bash
# 1. Estrai
cd ~/Dropbox/Documenti/perenne-business
tar -xzf ~/Downloads/perenne-design-full-v28.tar.gz

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
git commit -m "Design library v28: schema + UI + bug fixes + code-delivery v2 payload"
git push

# 7. Pulisci
rm ~/Downloads/perenne-design-full-v28.tar.gz
```

## ⚠️ Step manuale separato — Worker Cloudflare

Per chiudere il flow code → iPad serve **anche** patchare il Worker `perenne-api`. Vai su:
- Cloudflare Dashboard → Workers & Pages → `perenne-api` → Edit code
- Sostituisci/aggiungi `handleCodesSync` con la versione documentata in `SESSION-7-CODE-DELIVERY.md`
- Save and Deploy

Senza il Worker patch, il bundle perenne-business funziona perfettamente per la parte Design Library + UI + ordini, ma i codici emessi NON popolano automaticamente il KV per /team/{CODE}. I codici vecchi (es. STELVIO2026 manuali da admin panel) continuano a funzionare invariati.

## Verifica post-deploy

### Database integrity (Neon SQL editor)

```sql
SELECT COUNT(*) FROM "Order" WHERE "designSnapshotJson" IS NULL;
-- → deve essere 0

SELECT "companyId", COUNT(*) FROM "Design"
WHERE "isDefault" = true
GROUP BY "companyId" HAVING COUNT(*) <> 1;
-- → vuoto
```

### UI smoke test

1. `/designs` → vedi i design con thumbnail spread (cover + page side-by-side), default badge, nome cliccabile
2. Click sul **nome** del design → diventa input editabile, Enter salva
3. Click su **Edit** → entri nell'editor, vedi il nome editabile in alto a sinistra
4. Tab **Pages** → vedi 4 paper colors (off-white default, beige, charcoal, navy), pattern più tenui
5. Toggle **View mode: Spread** → due pagine affiancate (sinistra mirror, destra editabile)
6. Carica 2+ loghi, click invert su entrambi → entrambi diventano bianchi (bug #1 fixato)
7. Sposta lo slider opacity → l'oggetto cambia trasparenza in tempo reale (bug #3 fixato)
8. Salva cover, salva watermarks → toast verde
9. `/store` → dropdown design popolato, scegli design, "Buy pack" → Stripe checkout

### Code-to-iPad test (dopo Worker patch)

```bash
# Genera un codice tramite checkout reale (o test mode), poi:
curl https://api.perenne.app/team/PRN-XXXX-XXXX-XXXX
# Atteso: JSON con campi legacy + nuovo blocco "design" pieno

# In Perenne Note iOS: Settings → Team → inserisci codice → Activate
# Atteso: app riconosce il codice, scarica config, applica brand
```

## Files inclusi (29 totali)

```
prisma/
  schema.prisma                                 (Design model + 2 cols on Order)

scripts/
  migrate-designs.ts                            (idempotent backfill)

types/
  design.ts                                     (Design, DesignSummary, DesignSnapshot)

lib/
  design.ts                                     (helpers: snapshot, default, dual-write)

app/api/designs/
  route.ts                                      (GET list, POST create)
  [id]/route.ts                                 (GET, PATCH, DELETE)
  [id]/duplicate/route.ts                       (POST duplicate)
  [id]/set-default/route.ts                     (POST set-default)
  [id]/rename/route.ts                          (NEW v28 — POST rename)

app/api/cover/route.ts                          (LEGACY — dual-writes)
app/api/checkout/route.ts                       (accepts designId, snapshots)
app/api/codes/route.ts                          (returns designName)
app/api/internal/code-resolve/[code]/route.ts   (HMAC endpoint for Worker)
app/api/stripe/webhook/route.ts                 (NEW v28 — sends design snapshot to /codes/sync)

app/cover/page.tsx                              (redirect to /designs/[default]/edit)
app/designs/page.tsx                            (library list, fetches pageWatermarksJson)
app/designs/new/page.tsx                        (create form)
app/designs/[id]/edit/page.tsx                  (editor with InlineDesignName header)
app/store/page.tsx                              (passes designs to grid)

components/StoreGrid.tsx                        (design dropdown)
components/CodesTable.tsx                       (Design column)
components/editor/EditorClient.tsx              (parametrized + readOnly + onInput sliders)
components/editor/CoverEditor.tsx               (NEW v28 — invert cache fix)
components/editor/PageEditor.tsx                (NEW v28 — spread view toggle)
components/editor/paperPresets.ts               (NEW v28 — 4 iOS colors, softer alphas)
components/editor/snapGuides.ts                 (BlendColor invert filter)
components/layout/Shell.tsx                     (Cover → Designs)

components/designs/
  types.ts                                      (DesignSummaryWithThumb)
  DesignThumbnail.tsx                           (NEW v28 — spread mode)
  DesignsList.tsx                               (NEW v28 — InlineDesignName + spread thumbs)
  NewDesignForm.tsx                             (client form)
  InlineDesignName.tsx                          (NEW v28 — click-to-edit name)

DEPLOY-README.md                                (this file)
SESSION-7-CODE-DELIVERY.md                      (Worker patch + Swift extension)
```
