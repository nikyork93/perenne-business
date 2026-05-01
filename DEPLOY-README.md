# Design Library v29 — WORKER-LESS DEPLOY

Single bundle: dismette completamente il Cloudflare Worker `perenne-api` e centralizza tutto su perenne-business (Vercel + Postgres + R2).

## Cosa cambia rispetto a v28

**Dismesso**:
- Cloudflare Worker `perenne-api` (codice + admin panel + KV `PERENNE_TEAMS`)
- env vars `PERENNE_API_URL`, `PERENNE_API_SECRET`, `ASSET_UPLOAD_WORKER_URL`, `ASSET_UPLOAD_WORKER_SECRET`
- endpoint interno `/api/internal/code-resolve` (era per il Worker)
- `syncCodesToKV` nel webhook Stripe (più i codici stanno nel DB direttamente)

**Aggiunto**:
- Endpoint pubblico `/api/team/[code]` con edge cache 1h — replica del Worker `/team/{CODE}`, legge da Postgres (sia `NotebookCode` da Stripe sia `LegacyTeamCode` manuali)
- Middleware Next.js: `api.perenne.app/team/*` → `/api/team/*` (rewrite host-based, l'iOS NON nota il cambio)
- Schema `LegacyTeamCode` per i codici manuali tipo STELVIO2026
- UI admin `/admin/legacy-codes` (lista + crea + edit + enable/disable + delete) — sostituisce il pannello `api.perenne.app/admin`
- API CRUD `/api/admin/legacy-codes/*` SUPERADMIN-only
- `lib/r2.ts` — direct-to-R2 con `@aws-sdk/client-s3`, sostituisce il proxy via Worker
- `/api/upload` riscritto direct-to-R2
- Script una-tantum `scripts/migrate-worker-kv.ts` per importare codici esistenti dal Worker KV in Postgres

**R2 stays where it is**: il bucket `assets.perenne.app` continua a esistere, ma perenne-business ci scrive direttamente con S3 SDK invece che attraverso il Worker. Zero migration di dati R2.

## Sequenza deploy (3 fasi)

### Fase A — Codice (deploy Vercel)

```bash
cd ~/Dropbox/Documenti/perenne-business
tar -xzf ~/Downloads/perenne-design-full-v29.tar.gz

# Install nuova dep S3 SDK
npm install

# Schema push (LegacyTeamCode + Design + Order columns)
npx prisma db push

# Rigenera Prisma client
npx prisma generate

# Backfill Design library (idempotente, safe)
npx tsx scripts/migrate-designs.ts --dry-run
npx tsx scripts/migrate-designs.ts

# Configura env vars su Vercel (Dashboard → Project → Settings → Environment Variables)
#   R2_ACCOUNT_ID         → da Cloudflare Dashboard → R2 → "Use R2 with APIs"
#   R2_ACCESS_KEY_ID      → genera token su Cloudflare R2 → Manage R2 API Tokens
#   R2_SECRET_ACCESS_KEY  → ↑ stesso token
#   R2_BUCKET             → nome bucket (probabilmente "perenne-assets" o simile)
#   R2_PUBLIC_BASE_URL    → https://assets.perenne.app

# Migra codici esistenti dal Worker KV (PRIMA del DNS swap, mentre Worker è ancora vivo)
WORKER_ADMIN_PASS="PerenneB2B2026!" npx tsx scripts/migrate-worker-kv.ts --dry-run
WORKER_ADMIN_PASS="PerenneB2B2026!" npx tsx scripts/migrate-worker-kv.ts

# Commit & push (Vercel auto-deploya)
git add -A
git commit -m "Design library v29: dismiss Worker — DB-backed /team + admin UI for legacy codes"
git push

rm ~/Downloads/perenne-design-full-v29.tar.gz
```

### Fase B — DNS swap (Vercel + Cloudflare, ~10 minuti)

1. **Vercel** → Project `perenne-business` → Settings → Domains → **Add Domain** → `api.perenne.app`
2. Vercel ti dà un CNAME target tipo `cname.vercel-dns.com`
3. **Cloudflare** → Domain `perenne.app` → DNS → trova record `api`
   - Stato attuale: punta al Worker (Worker route `api.perenne.app/*`)
   - Cambia in: `CNAME api → cname.vercel-dns.com` (proxied OFF — grigio non arancione)
4. Rimuovi la Worker Route `api.perenne.app/*` da Cloudflare → Workers → `perenne-api` → Settings → Triggers → Routes
5. Aspetta propagazione (~2 min) e SSL Vercel auto-genera in ~30 sec
6. **Test smoke**:
   ```bash
   curl https://api.perenne.app/team/STELVIO2026
   # Atteso: JSON con company, logoURL, ecc. (servito da Vercel ora)
   ```
7. **Test iOS**: apri Perenne Note su iPad → Settings → Team → reset code → reattiva STELVIO2026. Deve funzionare invariato.

### Fase C — Cleanup (dopo che Fase B è verde da 24h)

Aspetta 24h per essere sicuro che tutti i client iOS abbiano usato la nuova route almeno una volta (la cache locale UserDefaults li tiene comunque attivi anche se /team/{CODE} fosse irraggiungibile).

```bash
# Cloudflare Dashboard:
#   1. Workers & Pages → perenne-api → Settings → Delete worker
#   2. R2 → Manage R2 API Tokens → revoca il token X-Upload-Secret se ne usavi uno separato dal Worker
#   3. KV → namespace PERENNE_TEAMS → Delete (l'hai migrato in Postgres)
#
# Vercel:
#   Project → Settings → Environment Variables → rimuovi:
#     PERENNE_API_URL
#     PERENNE_API_SECRET
#     ASSET_UPLOAD_WORKER_URL
#     ASSET_UPLOAD_WORKER_SECRET
#   Redeploy per propagare la rimozione.
```

R2 bucket `assets.perenne.app` resta (ci scriviamo ancora i loghi via lib/r2.ts).

## Verifica end-to-end

```bash
# 1. /api/team funziona via api.perenne.app per codici Stripe
curl https://api.perenne.app/team/PRN-XXXX-XXXX-XXXX

# 2. /api/team funziona per codici legacy
curl https://api.perenne.app/team/STELVIO2026

# 3. iOS app: Settings → Team → STELVIO2026 → Activate → vede config

# 4. Crea un nuovo codice manuale via UI:
#    business.perenne.app/admin/legacy-codes → + New code
#    Compila form, salva → curl /api/team/<NEWCODE>

# 5. Test edge cache:
curl -I https://api.perenne.app/team/STELVIO2026
# Atteso header: cache-control: public, s-maxage=3600, stale-while-revalidate=86400

# 6. Test upload:
#    Apri /designs/<id>/edit → carica un logo → deve apparire
#    su https://assets.perenne.app/covers/<companyId>/assets/<timestamp>-<filename>
```

## Verifica DB integrity

```sql
-- Codici legacy importati dal KV
SELECT COUNT(*) FROM "LegacyTeamCode";
-- → ≥ 1 (almeno STELVIO2026)

-- Design library è popolata?
SELECT COUNT(*) FROM "Design";
-- → ≥ 1 per company

-- Codici Stripe hanno snapshot?
SELECT COUNT(*) FROM "Order" WHERE "designSnapshotJson" IS NULL;
-- → 0
```

## Trade-off accettati

- **Latenza primo /team/{CODE}**: ~30-100ms (vs ~5-10ms KV edge). Subsequent requests <5ms via Vercel Edge cache.
- **iOS offline tolerance**: invariato. UserDefaults cachea config dopo prima activation, app funziona offline come prima.
- **Single point of failure**: Vercel down = sia portale sia /team/{CODE} down. Mitigazione: Vercel uptime 99.99%, e iOS già usa cache locale.

## Files inclusi (40 totali)

```
package.json                                           (NEW: @aws-sdk/client-s3)
middleware.ts                                          (NEW: api.perenne.app rewrite)

prisma/schema.prisma                                   (Design + LegacyTeamCode + Order cols)

scripts/
  migrate-designs.ts                                   (idempotent design backfill)
  migrate-worker-kv.ts                                 (NEW: KV → LegacyTeamCode import)

types/design.ts

lib/
  design.ts                                            (snapshot helpers, dual-write)
  r2.ts                                                (NEW: direct-to-R2 S3 client)

app/api/
  team/[code]/route.ts                                 (NEW: public team-code endpoint)
  upload/route.ts                                      (NEW: direct-to-R2)
  designs/route.ts
  designs/[id]/route.ts
  designs/[id]/duplicate/route.ts
  designs/[id]/set-default/route.ts
  designs/[id]/rename/route.ts
  cover/route.ts                                       (LEGACY — dual-writes)
  checkout/route.ts                                    (accepts designId, snapshots)
  codes/route.ts                                       (returns designName)
  stripe/webhook/route.ts                              (no more KV sync)
  admin/legacy-codes/route.ts                          (NEW: SUPERADMIN list+create)
  admin/legacy-codes/[id]/route.ts                     (NEW: GET/PATCH/DELETE)

app/
  cover/page.tsx                                       (redirect → /designs/[default]/edit)
  designs/page.tsx                                     (library list, fetches watermarks)
  designs/new/page.tsx
  designs/[id]/edit/page.tsx                           (editor with InlineDesignName)
  store/page.tsx                                       (passes designs to grid)
  admin/legacy-codes/page.tsx                          (NEW: SUPERADMIN admin page)

components/
  StoreGrid.tsx                                        (design dropdown)
  CodesTable.tsx                                       (Design column)
  layout/Shell.tsx                                     (Cover→Designs, +Legacy codes nav)
  editor/EditorClient.tsx                              (parametrized + readOnly + onInput)
  editor/CoverEditor.tsx                               (invert cache fix)
  editor/PageEditor.tsx                                (spread view toggle)
  editor/paperPresets.ts                               (4 iOS colors, softer alphas)
  editor/snapGuides.ts                                 (BlendColor invert filter)
  designs/types.ts
  designs/DesignThumbnail.tsx                          (spread mode)
  designs/DesignsList.tsx                              (InlineDesignName + spread thumbs)
  designs/NewDesignForm.tsx
  designs/InlineDesignName.tsx                         (click-to-edit name)
  admin/LegacyCodesClient.tsx                          (NEW: SUPERADMIN UI)

DEPLOY-README.md                                       (this file)
```
