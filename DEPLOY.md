# Perenne Business — Deploy Guide

Guida passo-passo per mettere V1 in produzione su `business.perenne.app`.

---

## Pre-requisiti

- Account Cloudflare (dominio `perenne.app` già sotto Cloudflare) ✅
- Account Neon.tech (per Postgres)
- Account Stripe (anche in modalità test per iniziare)
- Account Resend.com (per email transazionali)
- Repo GitHub `perenne-business` (nuovo, privato)
- Repo GitHub `perenne-api` (da creare e collegare al Worker esistente)

---

## Step 1 — Database Neon

1. Vai su [console.neon.tech](https://console.neon.tech) → Create Project
2. Nome: `perenne-business`, region: **Frankfurt** (più vicino a IT/EU clientela)
3. Copia **Connection string (pooled)** → `DATABASE_URL`
4. Copia **Connection string (direct/unpooled)** → `DIRECT_URL`
   - Serve a Prisma per le migrations — Neon pooler non supporta DDL

---

## Step 2 — Stripe

### Test mode
1. Dashboard Stripe → Developers → API keys → copia `Secret key` (sk_test_...) → `STRIPE_SECRET_KEY`
2. Copia `Publishable key` (pk_test_...) → `STRIPE_PUBLISHABLE_KEY`
3. Enable **Stripe Tax** (Settings → Tax → Get started). Senza questo, l'IVA non si calcola.
4. Configura **Products**: non serve creare prodotti in dashboard — usiamo `price_data` dinamico in Checkout.

### Webhook
1. Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://business.perenne.app/api/stripe/webhook`
3. Eventi da ascoltare:
   - `checkout.session.completed`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Copia **Signing secret** (whsec_...) → `STRIPE_WEBHOOK_SECRET`

### Passaggio a Live mode
Quando pronto, ripeti sopra in Live mode e sovrascrivi le env vars in Cloudflare Pages.

---

## Step 3 — Resend

1. [resend.com](https://resend.com) → API Keys → Create API key
2. Scope: "Sending access", nome: "Perenne Business production"
3. Copia → `RESEND_API_KEY`
4. Verifica il dominio `perenne.app`:
   - Domains → Add domain → `perenne.app`
   - Aggiungi i record DKIM/SPF/DMARC su Cloudflare DNS (li mostra la dashboard)
5. `EMAIL_FROM` = `"Perenne Business <business@perenne.app>"`

---

## Step 4 — Cloudflare Pages deploy

### 4a. Repo GitHub
```bash
cd perenne-business
git init
git add .
git commit -m "initial: Perenne Business V1"
# Create private repo on GitHub, then:
git remote add origin git@github.com:nikyork93/perenne-business.git
git branch -M main
git push -u origin main
```

### 4b. Connect to Cloudflare Pages
1. Cloudflare dashboard → Workers & Pages → **Create** → **Pages** → **Connect to Git**
2. Select repo `perenne-business`
3. Framework preset: **Next.js**
4. Build command: `npm run build`
5. Build output directory: `.next`
6. Root directory: `/`
7. Node version: 20

### 4c. Environment variables
Nella dashboard Pages → Settings → Environment variables, aggiungi (per Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://...&pgbouncer=true` (Neon pooled) |
| `DIRECT_URL` | `postgresql://...` (Neon direct) |
| `AUTH_SECRET` | genera: `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | `https://business.perenne.app` |
| `RESEND_API_KEY` | `re_...` |
| `EMAIL_FROM` | `Perenne Business <business@perenne.app>` |
| `STRIPE_SECRET_KEY` | `sk_live_...` (test all'inizio) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `PERENNE_API_URL` | `https://api.perenne.app` |
| `PERENNE_API_SECRET` | genera: `openssl rand -base64 48`, SALVA in 1Password |
| `SUPERADMIN_EMAIL` | la tua email (es. `nicholas@perenne.app`) |

### 4d. Custom domain
1. Cloudflare Pages → Custom domains → Add → `business.perenne.app`
2. Cloudflare crea automaticamente il CNAME su `perenne.app` zone
3. SSL propaga in 30-60s

### 4e. Apply database schema
Dopo il primo deploy, apri una console locale con le env vars di production:
```bash
DATABASE_URL="..." DIRECT_URL="..." npm run prisma:push
DATABASE_URL="..." SUPERADMIN_EMAIL="..." npm run prisma:seed
```

---

## Step 5 — Worker `perenne-api` update

Il Worker esistente ha già gestione `/team/{code}` e admin panel. Serve aggiungere 4 endpoint dai snippet:

### 5a. Aggiorna codice Worker
Apri il codice attuale (Dashboard → Workers → `perenne-api` → Edit code) e aggiungi in cima:

```javascript
// Import handlers from snippets
import { handleAssetUpload }  from './snippets/asset-upload.js';
import { handleCodesSync }    from './snippets/codes-sync.js';
import { handleCompanySync }  from './snippets/company-sync.js';
import { handleTeamLookup }   from './snippets/team-lookup.js';
```

Nel main fetch handler, prima dei tuoi existing routes, aggiungi:

```javascript
const url = new URL(request.url);
const path = url.pathname;

// NEW portal→worker endpoints (HMAC-auth)
if (path === '/assets/upload' && request.method === 'POST') return handleAssetUpload(request, env);
if (path === '/codes/sync'    && request.method === 'POST') return handleCodesSync(request, env);
if (path === '/companies/sync' && request.method === 'POST') return handleCompanySync(request, env);

// iOS consumer endpoint
const teamMatch = path.match(/^\/team\/([A-Z0-9-]+)$/i);
if (teamMatch) return handleTeamLookup(request, env, teamMatch[1]);
```

### 5b. Env binding per Worker
Dashboard → Workers → `perenne-api` → Settings → Variables:

- `PERENNE_API_SECRET` (Encrypt): stesso valore di `PERENNE_API_SECRET` in Pages
- `PORTAL_WEBHOOK_URL` (Plain text): `https://business.perenne.app`

R2 e KV bindings li hai già (`ASSETS`, `TEAMS`).

### 5c. Connect Git (optional)
- Dashboard → `perenne-api` → Settings → Build → Connect to Git → crea repo `perenne-api`
- Da qui auto-deploy ad ogni `git push`

---

## Step 6 — Smoke test end-to-end

Il check che conferma che tutto il sistema funziona in produzione.

### T1 — Signup + onboarding
- [ ] Visita `business.perenne.app` → "Create account"
- [ ] Inserisci email → ricevi magic link → click → redirect onboarding
- [ ] Compila form company → redirect `/dashboard` con stats a zero

### T2 — Cover editor + R2 upload
- [ ] `/cover` → Upload PNG logo
- [ ] Verifica in Cloudflare R2 che il file sia in `assets.perenne.app/teams/{companyId}/...`
- [ ] Drag + resize + rotate nel canvas
- [ ] Click "Save Cover" → flash verde "Saved as version 1"
- [ ] Refresh pagina → config si ricarica correttamente

### T3 — Stripe checkout
- [ ] `/store` → click "Starter pack €49"
- [ ] Redirect a Stripe Checkout → pagamento con carta test `4242 4242 4242 4242`
- [ ] Redirect a `/store/success?order_id=...` → ordine PENDING
- [ ] Dopo 2-5s → webhook arriva → page si refresh → ordine PAID
- [ ] `/codes` → vedi 10 codici `PRN-XXXX-XXXX-XXXX` status AVAILABLE

### T4 — CSV export
- [ ] `/codes` → click "Export CSV"
- [ ] Scarica `perenne-codes-YYYY-MM-DD.csv`
- [ ] Apri: colonne `code,status,...` corrette

### T5 — Distribution
- [ ] Prepara CSV test: `email,name\ntest@example.com,Test User`
- [ ] `/distribution` → upload CSV → crea batch DRAFT
- [ ] Click "Send now →" → emails partono (verifica su test@ ricevuto)

### T6 — Worker sync
- [ ] Nel Worker dashboard → KV → `PERENNE_TEAMS` namespace
- [ ] Trova `company:{companyId}` → JSON con cover
- [ ] Trova `team:PRN-XXXX-XXXX-XXXX` → JSON con companyId

### T7 — iOS activation (richiede app aggiornata)
- [ ] Perenne Note → Settings → Team → inserisci codice
- [ ] Attivazione riuscita → copertina quaderno mostra il branding
- [ ] Tenta lo stesso codice su altro device → errore 410 Gone

### T8 — Admin
- [ ] Con account superadmin, visita `/admin/companies`
- [ ] Vedi la company appena creata con revenue €49
- [ ] `/admin/revenue` → MRR, breakdown per tier
- [ ] `/admin/audit` → vedi eventi company.created, cover.saved, order.paid

### T9 — Security
- [ ] Logout e riprovare ad accedere a `/dashboard` → redirect a `/login`
- [ ] Utente non-superadmin visita `/admin/companies` → 404
- [ ] Stripe webhook con signature invalida → 400 Bad Request
- [ ] Upload file 10MB → errore "File too large"

### T10 — Refund flow
- [ ] In Stripe dashboard, refund l'ordine di test
- [ ] Webhook `charge.refunded` arriva → ordine REFUNDED
- [ ] Codici del batch che non erano CLAIMED → REVOKED

---

## Troubleshooting

**Webhook Stripe non arriva**
- Verifica che la route `/api/stripe/webhook` sia esclusa dal middleware matcher
- Stripe dashboard → Webhooks → Logs → vedi response code
- Se 400 invalid signature: controlla che `STRIPE_WEBHOOK_SECRET` sia copiato correttamente (include `whsec_`)

**R2 upload fallisce con 401 Invalid signature**
- Stesso `PERENNE_API_SECRET` in Pages e in Worker
- Timestamp clock skew: verifica time zone del server (deve essere UTC)

**Emails non arrivano**
- Resend dashboard → Logs → vedi errori DKIM/SPF
- Verifica che EMAIL_FROM sia su dominio verificato

**Build Cloudflare Pages fallisce**
- Node version: deve essere 20 (Settings → Build → Node version)
- Se `prisma generate` fallisce: aggiungi a env `PRISMA_GENERATE_DATAPROXY=true` (non serve su Neon standard)

**Prisma migrations falliscono**
- Usa `prisma db push` invece di `prisma migrate deploy` per V1 (è non-migratorio)
- Se persiste, verifica che `DIRECT_URL` sia la non-pooled connection string

---

## Post-launch

- Configura uptime monitor (UptimeRobot gratis) su `business.perenne.app`
- Monitora Neon connection pool (max 100 conn in Starter, basta per V1)
- Rotazione `AUTH_SECRET` ogni 6 mesi (invalida tutte le sessioni — avvisare utenti)
- Backup DB: Neon fa snapshot automatici, ma export mensile JSON è prudente

Buon lancio.
