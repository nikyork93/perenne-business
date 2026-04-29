# Perenne Business v19 + v20 — Theme + Cover Editor v2 + Page Watermarks

Archivio comprensivo. Sostituisce qualunque archivio v19 precedente non ancora deployato.

## Cosa contiene

### v19 — Theme system + Cover editor v2
- **Theme dark/light** per utente (toggle in sidebar bottom, persistito su DB + cookie)
- **Cover editor**: invert color logo, proporzioni bloccate, dimensioni quaderno reali (392×540 ratio 0.725, corner radius 9px), upload immagine background

### v20 — Editor pagine con watermark
- Tab **Pages** nell'editor accanto a Cover
- Singola pagina preview (stesso ratio 0.725 della cover)
- Multipli watermark con stessi controlli del cover (scale, rotation, opacity, invert)
- Posizione fissa: il watermark appare identico su ogni pagina del quaderno
- Esclusione: la pagina "Property of a thinking human" (index 1) NON riceve il watermark

---

## ⚠️ STEP 1 — Schema Prisma (auto)

L'archivio include `apply-schema.sh` che:
1. Backuppa il tuo `schema.prisma` esistente
2. Aggiunge 3 campi se mancanti:
   - `User.themePreference`
   - `CoverConfig.backgroundImageUrl`
   - `CoverConfig.pageWatermarksJson`
3. Lancia `npx prisma db push` + `npx prisma generate`

È idempotente — puoi rilanciarlo, non duplica nulla.

---

## ⚠️ STEP 2 — Aggiungi `getOptionalSession` a `lib/auth.ts`

Apri `lib/auth.ts` ed aggiungi questa funzione (vedi `lib/auth-additions.ts` per il codice esatto):

```ts
export async function getOptionalSession() {
  // Returns session if present, null otherwise (NO redirect).
  // Used by app/layout.tsx to read theme from DB without forcing auth.
}
```

Esattamente come `requireSession` ma senza redirect — invece di lanciare, ritorna `null`.

---

## STEP 3 — Comando deploy completo

```bash
cd ~/Dropbox/Documenti/perenne-business && \
tar -xzf ~/Downloads/perenne-v19-final.tar.gz && \
chmod +x apply-schema.sh && \
./apply-schema.sh && \
git add -A && \
git commit -m "v19+v20: theme + cover editor v2 + page watermarks editor" && \
git push && \
rm ~/Downloads/perenne-v19-final.tar.gz
```

⚠️ **Prima di lanciare il comando**: assicurati di aver fatto STEP 2 (modifica `lib/auth.ts`). Lo script Prisma e il push git non risolvono questo per te.

---

## File nell'archivio

```
README_v19_v20.md                                  questo file
apply-schema.sh                                    ⭐ auto-merge schema
lib/auth-additions.ts                              istruzioni per lib/auth.ts

# Theme system (v19)
app/layout.tsx                                     wrap con ThemeProvider
app/globals.css                                    CSS vars dark + light
tailwind.config.ts                                 colors via CSS vars
components/theme/ThemeProvider.tsx                 context client
components/theme/ThemeToggle.tsx                   pill in sidebar bottom
components/layout/Shell.tsx                        sidebar con toggle
app/api/user/me/route.ts                           PATCH theme preference

# Cover editor v2 (v19)
types/cover.ts                                     dimensioni 392×540, pageWatermarks
components/editor/CoverEditor.tsx                  invert + bg image + proporzioni bloccate

# Page editor v20 (NEW)
components/editor/PageEditor.tsx                   ⭐ editor watermark pagine
components/editor/EditorClient.tsx                 ⭐ tab Cover/Pages

# API routes
app/cover/page.tsx                                 carica cover + watermarks
app/api/cover/route.ts                             save con scope discriminator
app/api/upload/route.ts                            kind=asset|background|watermark
```

---

## Architettura editor con tab

```
/cover (URL invariato per compatibility)
└─ EditorClient (tab switcher)
    ├─ Tab "Cover"
    │   └─ CoverEditor (proprio Save button → POST /api/cover {scope: 'cover'})
    └─ Tab "Pages"
        └─ PageEditor  (proprio Save button → POST /api/cover {scope: 'pageWatermarks'})
```

Ogni tab è auto-contenuto e ha il suo Save indipendente. L'API gestisce update parziali: salvare la cover preserva i watermarks correnti e viceversa. Ogni save crea una nuova versione di `CoverConfig`.

---

## Specifiche tecniche

### Editor pagine

- **Canvas**: 392 × 540 (stesso del cover, ratio 0.725 = quaderno fisico Swift 725 × 1000)
- **Background preview**: off-white `#fafaf7` (simula la pagina di carta)
- **Default scale**: 25% (più piccolo dei logo cover che sono 40%)
- **Default opacity**: 0.3 (è un watermark, deve essere discreto)
- **Quick position**: 5 bottoni nel pannello sx (TL, TR, center, BL, BR) per posizionare velocemente
- **Esclusione page index 1**: salvataggio in DB, ma è il rendering iOS che applica l'esclusione (vedi sotto)

### Schema persistence

```prisma
model CoverConfig {
  // ... campi esistenti ...
  backgroundImageUrl  String?     // bg image (v19)
  pageWatermarksJson  Json?       // array di CoverAssetRef[] (v20)
}
```

Il campo `pageWatermarksJson` contiene un array degli stessi oggetti usati per `cover.assets`:
```ts
[
  { name, url, x, y, scale, rotation, opacity, invert },
  ...
]
```

### Theme system

Persistenza tripla:
1. **DB** `User.themePreference` (cross-device, fonte di verità per utenti loggati)
2. **Cookie** `perenne_theme` (1 anno, SSR consistency e utenti non loggati)
3. **`<html data-theme="...">`** (applicato lato server, no flash)

Inline script in `<head>` setta `data-theme` PRIMA del paint per evitare flash su connessioni lente.

Palette light:
- Background: `#e5e7eb` · Text: `#18181b` · Sidebar: `rgba(bianco, 0.75)`
- Accent teal `#4a7a8c` invariato · Aura opacity 0.10 (vs 0.30 in dark)

---

## Implementazione iOS (lavoro futuro)

Il portale ora salva i watermark, ma il rendering nell'app iOS **non è ancora implementato**. Quando vorrai farlo:

### 1. Worker `api.perenne.app`
Quando serve la team config JSON, includere il campo `pageWatermarks` letto da `CoverConfig.pageWatermarksJson`.

### 2. Swift app `SinglePageView.swift`
Aggiungere un layer di rendering watermark prima di `mediaLayer`:

```swift
// Logica esclusione: solo pagina 1 (Property of) viene saltata
if pageIndex != 1 {
    PageWatermarksView(watermarks: notebook.teamConfig?.pageWatermarks ?? [])
        .clipShape(pageShape)
        .allowsHitTesting(false)
}
```

`PageWatermarksView` legge le coordinate normalizzate 0-1 e le moltiplica per `pageSize` (725×1000), gestisce opacity, rotation, invert (con `.colorInvert()`).

---

## Test post-deploy

### Theme toggle
1. Login → click toggle in sidebar bottom
2. Transizione smooth dark ↔ light, niente flash al refresh
3. Login da altro browser/device: tema sincronizzato dal DB

### Cover editor
1. `/cover` → tab "Cover" attivo di default
2. Carica logo PNG nero → "Invert color" lo rende bianco
3. Trascina dagli angoli → ridimensiona uniforme (no stretch)
4. Upload pattern bg → riempie il canvas con coverage
5. Save → version+1, audit `cover.saved`

### Page editor
1. `/cover` → click tab "Pages"
2. Background off-white visibile (simula pagina di carta)
3. Carica un logo → appare al centro a opacity 0.3
4. Click "↘" (bottom-right) → si sposta in basso a destra
5. Multipli watermark: carica 2 logo → entrambi posizionabili
6. Save Watermarks → version+1, audit `cover.watermarks_saved`

### Persistenza
- Salva cover + watermark → reload `/cover` → tutto ricomparire identico in entrambi i tab

---

## Rollback

Se qualcosa va storto:

```bash
# 1. Ripristina lo schema
cp prisma/schema.prisma.backup-* prisma/schema.prisma
npx prisma db push --skip-generate
npx prisma generate

# 2. Revert del codice
git revert HEAD
git push
```

I 3 nuovi campi sono opzionali/default → safe per rollback senza data loss.

---

## Note finali

- **`app/api/upload/route.ts`** ora supporta 3 valori per `kind`: `asset` (logo cover), `background` (immagine sfondo cover), `watermark` (logo pagine). Path R2 separati: `covers/{id}/assets/`, `covers/{id}/backgrounds/`, `covers/{id}/watermarks/`
- Lo script `apply-schema.sh` aggiunge i campi DOPO le directive `@@unique` perché il regex matcha il blocco intero. Prisma compila senza problemi e un eventuale `npx prisma format` aggiusterà l'ordine. Cosmetico, non un bug.
