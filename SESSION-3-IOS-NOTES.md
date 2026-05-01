# Design Library — Session 3 (iOS + Cloudflare Worker integration)

## Cos'è successo durante l'esplorazione del codice iOS

Durante Session 3 ho aperto l'app iOS (`Perenne_Note.zip`) e ho scoperto che l'integrazione brand iOS↔backend NON è quella che avevamo assunto. Il quadro reale:

```
iOS app (Perenne Note)
    │
    │ GET https://api.perenne.app/team/{CODE}
    ▼
Cloudflare Worker (api.perenne.app)
    │
    │ ① Reads code → company mapping from Worker KV (popolato da
    │    perenne-business via /codes/sync al webhook Stripe)
    │
    │ ② [MISSING — questa è la tua prossima decisione]
    │    Come ottiene il design da renderizzare?
    │
    ▼
perenne-business (business.perenne.app)
    │
    │ Genera codici al checkout, sync codes → Worker KV
    │ Editor /designs gestisce designs e snapshot
```

L'iOS attuale (`TeamBrandManager.swift`) consuma una struct `TeamBrandConfig` con campi semplificati:

```swift
struct TeamBrandConfig: Codable {
    let company: String
    let logoURL: String?              // Symbol/icon logo
    let logoExtendedURL: String?      // Extended text logo
    let logoWhiteURL: String?         // White version for dark covers
    let colors: TeamColors?
    let quote: String?
    let seats: Int?
    let expires: String?
}
```

**Problema strutturale:** questa struct NON contiene posizioni asset, watermark di pagina, sfondo immagine, opacità, rotazioni, scale — cioè TUTTO quello che l'editor produce. L'iOS oggi sta solo usando un sottoinsieme banale (logo + colore + quote) e ignorando tutto il resto. Quindi anche prima del refactor design library, una parte dei dati editor era già "morta".

## Cos'ho fatto in questa sessione

### 1. Nuovo endpoint internal `/api/internal/code-resolve/[code]`

**File**: `app/api/internal/code-resolve/[code]/route.ts`

È l'endpoint che il **Cloudflare Worker** dovrà chiamare per risolvere un codice in:

- stato del codice (REVOKED → 410, not found → 404)
- info company (name, logoSymbol, logoExtended, primaryColor)
- **snapshot completo del design** (cover background + assets + page watermarks + quote — tutto frozen al momento dell'acquisto)

Auth: HMAC-SHA256 con `PERENNE_API_SECRET` (la stessa env var che usate già per `/codes/sync` Worker→business). Replay protection: timestamp ≤ 5 min.

Esempio curl per testare:

```bash
TS=$(date +%s%3N)
SIG=$(node -e "const c=require('crypto');console.log(c.createHmac('sha256',process.env.PERENNE_API_SECRET).update(process.env.TS+':'+process.env.CODE).digest('base64url'))" \
  TS=$TS CODE=PRN-XXXX-XXXX-XXXX)
curl -H "x-perenne-signature: $SIG" \
     -H "x-perenne-timestamp: $TS" \
     https://business.perenne.app/api/internal/code-resolve/PRN-XXXX-XXXX-XXXX
```

Schema della risposta:

```json
{
  "code": "PRN-XXXX-XXXX-XXXX",
  "status": "AVAILABLE" | "CLAIMED" | "REVOKED",
  "claimed": false,
  "claimedAt": null,
  "claimedDeviceId": null,
  "company": {
    "name": "Acme S.r.l.",
    "slug": "acme",
    "logoExtendedUrl": "https://...",
    "logoSymbolUrl": "https://...",
    "primaryColor": "#1a1a1a"
  },
  "design": {
    "name": "Christmas 2026",
    "archived": false,
    "snapshot": {
      "v": 1,
      "backgroundColor": "#1a1a1a",
      "backgroundImageUrl": null,
      "assets": [ /* CoverAssetRef[] */ ],
      "pageWatermarks": [ /* CoverAssetRef[] */ ],
      "quote": { "text": "...", "position": "bottom", "color": "#ffffff" }
    }
  }
}
```

`design` è `null` per ordini pre-migrazione (e in quel caso l'iOS può fare fallback alla logica vecchia "solo company branding").

### 2. NON ho modificato `TeamBrandManager.swift` né il Worker

Perché:
- **Worker code**: non l'ho nel context, non ho il file. Devi tu o passarmelo per scriverti il diff esatto, o decidere tu come integrarlo.
- **TeamBrandManager.swift**: il refactor giusto dipende da come decidi di gestire il Worker (vedi Decisioni sotto). Cambiare l'iOS senza prima decidere la strategia Worker è prematuro.

## Decisioni che servono prima di chiudere il cerchio

### Decisione A — Strategia Worker

Hai due opzioni:

**Opzione A1 — Worker proxy on-demand** (più semplice, latenza maggiore)
- iOS chiama `https://api.perenne.app/team/{CODE}`
- Worker chiama `https://business.perenne.app/api/internal/code-resolve/{CODE}` con HMAC
- Worker passa la risposta all'iOS (eventualmente trasformata nella struct legacy `TeamBrandConfig` per compat)
- Caching: KV con TTL ~5 min

**Opzione A2 — Worker pre-syncato** (latenza minima, sync logic complessa)
- perenne-business push lo snapshot completo del design al Worker KV già al momento del checkout PAID (oltre ai codici)
- Worker risponde all'iOS direttamente da KV senza chiamare back business
- Quando un design viene editato (per ordini esistenti il snapshot è frozen, ma per la default Design può essere usata in nuovi acquisti), nessun sync necessario
- Un po' più di lavoro Worker-side ma latenza minima per gli utenti iOS

Io consiglio **A1**: il Worker è già un proxy logico, +1 chiamata su una redemption fresca è tollerabile, e la cache KV elimina il costo per le ridenzioni successive. A2 è migliore se hai pochi codici molto attivi — non sembra il caso.

### Decisione B — Estendere `TeamBrandConfig` o nuova struct?

L'iOS attuale ha la struct semplificata. Per consumare lo snapshot pieno (assets + watermarks + posizioni), serve estendere la struct Swift. Due strade:

**Opzione B1 — Estendi `TeamBrandConfig`** (additive, retrocompat) — consigliata
```swift
struct TeamBrandConfig: Codable {
    let company: String
    let logoURL: String?
    let logoExtendedURL: String?
    let logoWhiteURL: String?
    let colors: TeamColors?
    let quote: String?

    // ── NEW (additive, optional for backward compat) ──
    let design: DesignSnapshot?       // null per ordini pre-migrazione

    struct DesignSnapshot: Codable {
        let v: Int
        let backgroundColor: String
        let backgroundImageUrl: String?
        let assets: [CoverAssetRef]
        let pageWatermarks: [CoverAssetRef]
        let quote: QuoteSnapshot?
    }

    struct CoverAssetRef: Codable {
        let name: String
        let url: String?
        let x: Double          // 0-1 normalised
        let y: Double          // 0-1 normalised
        let scale: Double
        let rotation: Double   // degrees
        let opacity: Double    // 0-1
        let invert: Bool?
    }

    struct QuoteSnapshot: Codable {
        let text: String?
        let position: String   // "top" | "center" | "bottom"
        let color: String      // hex
    }
}
```

**Opzione B2 — Nuova struct `RedeemedNotebookConfig`** (rottura) — sconsigliata
Refactor completo. Non vale la pena.

### Decisione C — Quando l'iOS deve usare `design.snapshot` vs il vecchio rendering?

Per ordini con `design != null` → usa snapshot.
Per ordini pre-migrazione (`design == null`) → fallback al vecchio rendering (logo + colore solo).

Il `CoverRenderer.swift` attuale è semplicissimo (89 righe, basato su `NotebookCover3D`). Per renderizzare il nuovo snapshot serve:
- Layer di sfondo color/image (già c'è)
- Layer per ogni asset di cover con posizione/scale/rotation/opacity/invert (NUOVO)
- Layer per ogni page watermark sui rendering delle singole pagine (NUOVO)

Mi serve il file `NotebookCover3D.swift` (e probabilmente PageRenderer / View della pagina) per scrivere questo refactor. Non ce l'ho nello zip che hai mandato.

## Files che mi servono per chiudere il cerchio

Quando vuoi che faccia il diff Swift completo, mandami:

1. **Codice del Cloudflare Worker** (probabilmente repository separato — quello che gira su `api.perenne.app`)
2. `Perenne Note/Homepage/NotebookCover3D.swift` — c'è ma non l'ho aperto, posso farlo se mi confermi il path
3. Eventuali `PageRenderer.swift` / view della singola pagina del notebook (per i page watermarks)

Con quei file scrivo Session 3.5 che chiude tutto: Worker patch + Swift extension + page watermark renderer.

## Cosa è deployabile ORA (Session 1+2+3 incluse)

L'endpoint `/api/internal/code-resolve/[code]` è autonomo, non rompe niente di esistente, e prepara il terreno per quando deciderai la strategia Worker. Anche senza il refactor iOS/Worker:

- Tutta la nuova UI Designs è funzionante (Library, editor parametrizzato, store con dropdown design)
- L'iOS continua a vedere il vecchio brand (perché chiama il Worker che a sua volta legge la KV vecchia) — nessuna regressione
- I nuovi snapshot vengono salvati correttamente nel DB
- Quando tu/io modificheremo il Worker, l'iOS inizierà a vedere i design corretti

Quindi il deploy unificato Session 1+2+3 è SAFE da fare adesso, e poi Session 3.5 quando hai i file Worker.
