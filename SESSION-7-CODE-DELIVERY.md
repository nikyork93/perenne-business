# Session 7 — Code-to-iPad Pipeline (STELVIO2026 flow extension)

## Quadro completo

L'infrastruttura **esiste già** (lavoro fatto a marzo 2026 — vedi chat "Bug strumento testo iPad app quaderno"). Il flow `STELVIO2026` funziona così oggi:

```
┌──────────────┐  POST /admin/teams      ┌─────────────────┐
│ Nicholas     │ ─────────────────────►  │ Worker /admin   │  ← basic auth
│ (admin web)  │   {company, logoURL,…}  │  perenne-api    │    PerenneB2B2026!
└──────────────┘                          └────────┬────────┘
                                                   │ KV.put(code, json)
                                                   ▼
                                          ┌────────────────┐
                                          │ KV PERENNE_TEAMS │
                                          └────────┬─────────┘
                                                   │
                                  GET /team/{CODE} │
                                                   ▼
┌──────────────┐                          ┌────────────────┐
│ iOS app      │ ─────────────────────►   │ Worker public  │
│ (Settings)   │  fetch JSON config       │  /team/{CODE}  │
└──────────────┘                          └────────────────┘
```

E un secondo flow è già in piedi tra `perenne-business` (Vercel) e il Worker:

```
┌──────────────────┐  POST /codes/sync    ┌─────────────┐
│ perenne-business │ ─────────────────►   │ Worker      │
│ Stripe webhook   │  HMAC-signed         │ perenne-api │
└──────────────────┘  {companyId, codes}  └─────────────┘
                                                  │
                                                  ▼
                                            (oggi non scrive in KV
                                             niente per ogni code —
                                             tipicamente è no-op,
                                             vedi sotto)
```

**Cosa cambia con la Design Library.** Il payload `/codes/sync` ora porta anche il design snapshot e il branding company. Il Worker scrive `KV[CODE]` per ogni codice generato, in modo che l'iOS chiami `/team/{CODE}` come ha sempre fatto e riceva tutto quello che serve in una sola GET — incluse le posizioni asset cover, page watermarks, sfondo, ecc.

```
                          v2 payload:
                          {
                            companyId,
                            codes: [...100 codes...],
                            company: { name, logoURL, ... },
                            design:  { name, snapshot: { assets, watermarks, ... } }
                          }
                                ↓
                          Worker scrive in KV per OGNI code:
                          KV[code] = { company, logoURL, ..., design: snapshot }
                                ↓
                          iOS GET /team/{code}
                                ↓
                          Risposta self-contained → renderizza cover + pages
```

## ① Patch Cloudflare Worker — `handleCodesSync`

Aggiungi/sostituisci `handleCodesSync` nel codice del Worker `perenne-api`. Il file completo del Worker è troppo grande per riscriverlo qui (è già stato consegnato a marzo nelle chat precedenti come `perenne-api-worker.js`), quindi consegno solo l'handler nuovo. Il resto del Worker (admin panel, `/team/{CODE}`, `/assets/upload`) NON cambia.

```javascript
// ════════════════════════════════════════════════════════════════
// handleCodesSync — POST /codes/sync (HMAC-auth)
// Chiamato da perenne-business al webhook Stripe checkout.session.completed.
//
// Accetta DUE versioni di payload:
//
//   v1 (legacy):  { companyId, codes }
//                 → no-op se non c'è già un team config in KV per la
//                   company. Manteniamo per backward compat.
//
//   v2 (design library):
//                 { v: 2, companyId, codes, company, design }
//                 → scrive KV[code] per ogni codice con il blob
//                   self-contained che iOS può consumare via /team/{code}.
//
// Auth: HMAC-SHA256 di `${timestamp}:${companyId}` con
// PERENNE_API_SECRET nell'header x-perenne-signature, replay window 5min.
// ════════════════════════════════════════════════════════════════

async function handleCodesSync(request, env) {
  // ─── HMAC verify ────────────────────────────────────────────────
  const sig = request.headers.get('x-perenne-signature') ?? '';
  const ts = request.headers.get('x-perenne-timestamp') ?? '';
  if (!sig || !ts) {
    return new Response(JSON.stringify({ error: 'Missing signature' }),
      { status: 401, headers: { 'content-type': 'application/json' } });
  }
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
    return new Response(JSON.stringify({ error: 'Stale signature' }),
      { status: 401, headers: { 'content-type': 'application/json' } });
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const { companyId, codes } = body;
  if (!companyId || !Array.isArray(codes)) {
    return new Response(JSON.stringify({ error: 'Missing companyId or codes' }),
      { status: 400, headers: { 'content-type': 'application/json' } });
  }

  // Verify HMAC against companyId+timestamp
  const expected = await hmacSign(`${ts}:${companyId}`, env.PERENNE_API_SECRET);
  if (expected !== sig) {
    return new Response(JSON.stringify({ error: 'Bad signature' }),
      { status: 401, headers: { 'content-type': 'application/json' } });
  }

  const isV2 = body.v === 2;

  // ─── v2: write per-code blob ────────────────────────────────────
  if (isV2 && body.company) {
    const company = body.company;
    const design = body.design ?? null;

    // Build the JSON blob each code resolves to. Keep legacy fields
    // populated (company, logoURL, logoExtendedURL, quote, colors)
    // so older iOS clients on TeamBrandConfig v1 still parse.
    const baseBlob = {
      company: company.name,
      logoURL: company.logoSymbolUrl,
      logoExtendedURL: company.logoExtendedUrl,
      logoWhiteURL: null,
      colors: company.primaryColor
        ? { primary: company.primaryColor, secondary: null }
        : null,
      quote: design?.snapshot?.quote?.text ?? null,
      seats: codes.length,
      expires: null,
      // ── New design payload (v2) — additive, ignored by old iOS ──
      design: design
        ? {
            name: design.name,
            snapshot: design.snapshot,
          }
        : null,
    };

    // Bulk-write to KV. Cloudflare KV doesn't have a real batch put,
    // but Promise.all is fine for ≤250 (PRO tier max). For SCALE
    // packs >250 you may want to chunk to avoid hammering the
    // worker's outbound concurrency limit.
    const writes = codes.map((code) => {
      const codeUpper = String(code).toUpperCase();
      return env.TEAMS.put(codeUpper, JSON.stringify(baseBlob));
    });

    await Promise.all(writes);

    return new Response(JSON.stringify({
      ok: true,
      written: codes.length,
      v: 2,
    }), { headers: { 'content-type': 'application/json' } });
  }

  // ─── v1 legacy: no-op pass-through (just logs) ──────────────────
  // Keep alive for backward compat — the v1 handler in production
  // before Design Library shipped did not write anything either,
  // it just returned 200 so the webhook's fire-and-forget didn't
  // log errors.
  return new Response(JSON.stringify({
    ok: true,
    written: 0,
    v: 1,
    note: 'v1 payload accepted but not persisted — upgrade portal to v2',
  }), { headers: { 'content-type': 'application/json' } });
}

// ─── HMAC helper (Web Crypto, no node:crypto in Workers) ──────────
async function hmacSign(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  // base64url to match Node's createHmac(...).digest('base64url')
  const b = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

**Routing in main fetch handler** del Worker (probabilmente già presente, da vedere e sostituire la riga di `/codes/sync`):

```javascript
if (path === '/codes/sync' && request.method === 'POST') {
  return handleCodesSync(request, env);
}
```

**Env binding** del Worker (verifica che esista — l'avevi già creato):
- `PERENNE_API_SECRET` (Encrypt, stesso valore di `PERENNE_API_SECRET` su Vercel)

## ② Estensione Swift `TeamBrandConfig`

L'iOS oggi ha la struct in `Perenne Note/TeamBrandManager.swift`. Estensione **additiva** (zero rotture, gli ordini pre-design hanno `design = nil` e l'app fa fallback al rendering vecchio):

```swift
// MARK: - Team Brand Configuration (loaded from server or stored locally)
struct TeamBrandConfig: Codable {
    let company: String
    let logoURL: String?              // Symbol/icon logo (cover, first page)
    let logoExtendedURL: String?      // Extended text logo (homepage header)
    let logoWhiteURL: String?         // White version for dark covers (optional)
    let colors: TeamColors?
    let quote: String?
    let seats: Int?
    let expires: String?

    // ── NEW (v2 — additive, optional) ──
    let design: DesignBlock?

    struct TeamColors: Codable {
        let primary: String
        let secondary: String?
    }

    struct DesignBlock: Codable {
        let name: String?
        let snapshot: DesignSnapshot
    }

    struct DesignSnapshot: Codable {
        let v: Int                              // schema version (=1)
        let backgroundColor: String             // hex
        let backgroundImageUrl: String?
        let assets: [CoverAssetRef]             // cover logos with positions
        let pageWatermarks: [CoverAssetRef]     // page watermarks
        let quote: QuoteSnapshot?
    }

    struct CoverAssetRef: Codable {
        let name: String
        let url: String?
        let x: Double          // 0-1 normalised — multiply by canvas width
        let y: Double          // 0-1 normalised — multiply by canvas height
        let scale: Double      // 1.0 = natural pixel size at 392px reference
        let rotation: Double   // degrees
        let opacity: Double    // 0-1
        let invert: Bool?      // optional — true to apply white blend
    }

    struct QuoteSnapshot: Codable {
        let text: String?
        let position: String   // "top" | "center" | "bottom"
        let color: String      // hex
    }
}
```

## ③ Refactor `CoverRenderer.swift` per consumare lo snapshot

Il file attuale (89 righe, basato su `NotebookCover3D`) renderizza solo logo+colore. Il refactor minimo è in `NotebookCover3D` (lì dove disegna logo singolo): se `teamBrand.config?.design?.snapshot != nil`, itera su `snapshot.assets` e renderizza ognuno con posizione/scale/rotation/opacity/invert. Per i page watermarks va modificato `PageView` (o equivalente — non l'ho nel context).

**Mi serve da te per scrivere il refactor Swift completo:**
1. `Perenne Note/Homepage/NotebookCover3D.swift`
2. Il file Swift della view della singola pagina del notebook (probabilmente `NotebookView.swift`, `PageView.swift`, o simile)

Mandameli e scrivo Session 7.5 con il diff Swift esatto. Senza quei due file lo scrivo a tentoni e rischio di rompere il rendering corrente.

## ④ Test end-to-end del flow

Una volta deployato il Worker patch + il bundle perenne-business v28:

```bash
# 1. Verifica Worker — payload v2 accettato
TS=$(date +%s%3N)
COMPANY_ID="<companyId>"
SIG=$(node -e "const c=require('crypto');console.log(c.createHmac('sha256',process.env.SEC).update(process.env.TS+':'+process.env.CID).digest('base64url'))" \
  SEC=$PERENNE_API_SECRET TS=$TS CID=$COMPANY_ID)
curl -X POST https://api.perenne.app/codes/sync \
  -H "x-perenne-signature: $SIG" \
  -H "x-perenne-timestamp: $TS" \
  -H "content-type: application/json" \
  -d '{
    "v": 2,
    "companyId": "'$COMPANY_ID'",
    "codes": ["TEST-CODE-FAKE-1234"],
    "company": { "name": "Test Co", "slug": "test", "logoSymbolUrl": null, "logoExtendedUrl": null, "primaryColor": "#1a1a1a" },
    "design": { "name": "Test", "snapshot": { "v": 1, "backgroundColor": "#1a1a1a", "backgroundImageUrl": null, "assets": [], "pageWatermarks": [], "quote": null } }
  }'
# Atteso: { "ok": true, "written": 1, "v": 2 }

# 2. Verifica che il code sia leggibile via /team
curl https://api.perenne.app/team/TEST-CODE-FAKE-1234
# Atteso: JSON con tutti i campi legacy + nuovo blocco "design"

# 3. Test reale end-to-end — fai un acquisto in /store con design Stelvio
#    Codice generato dal webhook → propagato in KV → l'iOS lo riconosce
```

## ⑤ Ciclo di lavoro per il prossimo design

Una volta che la pipeline è in piedi:

1. Apri `/designs/new` → crei "Christmas 2026"
2. Edit → carichi loghi, posizioni, watermark di pagina, salvi
3. Vai a `/store` → scegli "Christmas 2026" dal dropdown → compri 50 codici
4. Stripe webhook → snapshot del design → POST `/codes/sync` v2 → KV popolato
5. Email/CSV/altro → distribuisci i codici ai dipendenti
6. Dipendente apre Perenne Note → Settings → Team → inserisce codice → app fa GET `/team/{CODE}` → riceve JSON con design.snapshot → render dei loghi + watermark

I codici vecchi (es. STELVIO2026 manuale dall'admin panel) continuano a funzionare con il vecchio flow legacy — l'iOS vede `design = nil` e fa il fallback rendering semplice.

## ⑥ Cosa rimane aperto dopo questa sessione

- **Worker patch deployato manualmente** sul Cloudflare dashboard. Vai su Workers & Pages → `perenne-api` → Edit code, sostituisci/aggiungi `handleCodesSync` con la versione qui sopra, Save and Deploy.
- **Refactor Swift NotebookCover3D + PageView** per consumare `design.snapshot` — aspetta i file da te
- **Migration dei codici esistenti emessi prima del v2 payload**: se hai codici emessi tra il deploy di Session 1 (Design Library) e questa Session 7, hanno `Order.designSnapshotJson` valorizzato ma il Worker KV è vuoto per quei codici. Script una-tantum per re-syncarli — posso scriverlo se serve.
