# v32-clean — bundle deploy

## Cosa cambia

- **lib/r2.ts**: usa `aws4fetch` (6KB) invece di `@aws-sdk/client-s3` (10MB).
  Cold start su Vercel drasticamente più veloce.
- **app/api/team/[code]/route.ts**: completo, con `maxDuration=30`,
  full try/catch, lookup NotebookCode + LegacyTeamCode senza join Design.
- **app/api/upload/route.ts**: usa nuovo `lib/r2.ts`, `maxDuration=30`.
- **middleware.ts**: rimosso il rewrite `api.perenne.app` (Worker dismesso),
  fix 401 JSON per le API requests.
- **lib/prisma.ts**: singleton, log filtrato.
- **vercel.json**: `maxDuration=30` per tutte le route con DB query.
- **package.json**: rimosso `@aws-sdk/client-s3`, aggiunto `aws4fetch`.
- **scripts/migrate-worker-kv.ts**: cancellato.

## Connection string Neon

Aggiunto `connect_timeout=15&pool_timeout=15` a `DATABASE_URL` per gestire
il cold start di Neon (free plan auto-suspend).

## Deploy

```bash
cd ~/Dropbox/Documenti/perenne-business
tar -xzf ~/Downloads/perenne-v32-clean.tar.gz
bash deploy.sh
```

Lo script chiede conferma una volta sola, poi fa tutto.

## Test post-deploy

Aspetta 60-90s che Vercel deployi (vedi Deployments page),
poi:

```bash
curl -i --max-time 30 https://business.perenne.app/api/team/STLV
```

Atteso: HTTP/2 404 in <3 secondi.

E test login + Save Cover sull'editor.

## Cleanup Cloudflare (DOPO che v32 funziona)

Quando confermi che tutto va, su Cloudflare puoi cancellare:
- Worker `perenne-api` (Settings → Delete)
- KV `PERENNE_TEAMS` (Workers KV → ... → Delete)
- DNS record `api.perenne.app`

**NON cancellare**:
- Bucket R2 `perenne-assets` (qui ci sono i loghi caricati)
- Custom domain `assets.perenne.app` per il bucket

## Env vars Vercel da rimuovere (non più necessarie)

Su Vercel Settings → Environment Variables, puoi cancellare:
- `PERENNE_API_URL` (era per il Worker)
- `PERENNE_API_SECRET` (idem)
- `ASSET_UPLOAD_WORKER_URL` (se presente)
- `ASSET_UPLOAD_WORKER_SECRET` (idem)

Da MANTENERE su Vercel:
- DATABASE_URL, DIRECT_URL
- AUTH_SECRET, NEXT_PUBLIC_APP_URL
- RESEND_API_KEY, EMAIL_FROM, SUPERADMIN_EMAIL
- STRIPE_*
- R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL
