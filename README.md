# Perenne Business

Portal clienti B2B per Perenne Note. Le aziende acquistano pacchetti di codici, personalizzano la copertina dei loro quaderni aziendali, e distribuiscono i codici ai dipendenti.

- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind · Prisma · Neon PostgreSQL · Stripe · Resend · Fabric.js
- **Design:** Liquid Glass dark aesthetic (vedi `app/globals.css`)
- **Deploy:** Cloudflare Pages → `business.perenne.app`
- **Backend API:** separato, Cloudflare Worker su `api.perenne.app` (repo `perenne-api`)

---

## Setup locale

```bash
# 1. Install dependencies
npm install

# 2. Copy env and fill values
cp .env.example .env.local
# edit .env.local with Neon DB URL, Resend API key, Stripe keys, etc.

# 3. Generate Prisma client + push schema to DB
npm run prisma:generate
npm run prisma:push

# 4. Seed superadmin user
npm run prisma:seed

# 5. Run dev server
npm run dev
```

Apri http://localhost:3000 .

---

## Struttura cartelle

```
perenne-business/
├── app/
│   ├── (app)/          ← rotte autenticate (dashboard, editor, etc.)
│   ├── (auth)/         ← login, signup, magic link
│   ├── (admin)/        ← superadmin dashboard (/admin/*)
│   ├── api/            ← API routes
│   ├── layout.tsx
│   ├── page.tsx        ← landing placeholder
│   └── globals.css     ← Liquid Glass styles
├── components/
│   ├── ui/             ← Button, Panel, Input, etc.
│   ├── editor/         ← Cover editor (Fabric.js wrapper)
│   └── layout/         ← Topbar, Sidebar, Shell
├── lib/
│   ├── prisma.ts       ← Prisma singleton
│   ├── env.ts          ← Zod-validated env
│   ├── auth.ts         ← session management (coming Step 4)
│   └── ...
├── prisma/
│   ├── schema.prisma   ← 10 models (Company, User, Order, NotebookCode, ...)
│   └── seed.ts         ← superadmin bootstrap
├── public/
└── package.json
```

---

## Roadmap di sviluppo (V1)

Vedi la pagina Notion "Lista Sviluppo — 14 aree" per il dettaglio completo.

- [x] **Step 1** — Scaffold + Prisma schema
- [x] **Step 2** — Design system components
- [x] **Step 3** — Auth (magic link) + session middleware
- [x] **Step 4** — Onboarding form + Settings page + Company API
- [x] **Step 5** — Cover Editor in React (Fabric.js)
- [x] **Step 6** — Asset upload (R2 via Worker with HMAC)
- [x] **Step 7** — Store page + 5-tier pricing + Stripe Checkout
- [x] **Step 8** — Stripe webhook + automatic code generation (+ KV sync)
- [x] **Step 9** — Codes page with filters + CSV export
- [x] **Step 10** — Billing page + order history + Stripe invoice links
- [x] **Step 11** — Distribution (CSV upload + email batch with tracking)
- [x] **Step 12** — Superadmin area (companies / revenue / audit log)
- [x] **Step 13** — Worker `/team/{code}` + iOS TeamBrandManager patch
- [x] **Step 14** — Deploy guide + smoke test checklist (see DEPLOY.md)

**V1 complete and ready to deploy.**

---

## Deploy

- **Cloudflare Pages** collegato a GitHub `perenne-business` (auto-deploy su push `main`)
- Custom domain: `business.perenne.app`
- Env vars configurate nella dashboard Cloudflare Pages (Settings → Environment variables)
- `AUTH_SECRET` da generare in production: `openssl rand -base64 32`
- Cloudflare Access policy su `/admin/*` (whitelist email + 2FA)
