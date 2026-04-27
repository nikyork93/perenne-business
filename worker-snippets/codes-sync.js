// ════════════════════════════════════════════════════════════════
// PERENNE API WORKER — Codes sync endpoint
// Add this to the existing perenne-api worker.
//
// Endpoint: POST /codes/sync
// Called by: perenne-business portal webhook, after Stripe payment.
// Purpose:   Write newly-generated codes to KV so iOS GET /team/{code}
//            resolves immediately without going through the portal DB.
//
// Auth: HMAC-SHA256 (same scheme as /assets/upload)
//
// Body: { companyId: string, codes: string[] }
//
// Effect: For each code, writes KV key `team:{CODE}` with value JSON
//         pointing to the company + active cover config.
// ════════════════════════════════════════════════════════════════

export async function handleCodesSync(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // HMAC verification
  const signature = request.headers.get('x-perenne-signature');
  const timestamp = request.headers.get('x-perenne-timestamp');
  if (!signature || !timestamp) return json({ error: 'Missing auth headers' }, 401);

  const tsNum = parseInt(timestamp, 10);
  if (isNaN(tsNum)) return json({ error: 'Invalid timestamp' }, 401);
  const age = Date.now() - tsNum;
  if (age > 60_000 || age < -5_000) return json({ error: 'Request too old' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { companyId, codes } = body;
  if (typeof companyId !== 'string' || !companyId) {
    return json({ error: 'companyId required' }, 400);
  }
  if (!Array.isArray(codes) || codes.length === 0) {
    return json({ error: 'codes[] required' }, 400);
  }
  if (codes.length > 1000) {
    return json({ error: 'Too many codes in one request (max 1000)' }, 400);
  }

  // Verify HMAC
  const expected = await hmacSha256Base64Url(env.PERENNE_API_SECRET, `${timestamp}:${companyId}`);
  if (!safeCompare(expected, signature)) {
    return json({ error: 'Invalid signature' }, 401);
  }

  // Write each code to KV in parallel (rate limits in Workers are generous)
  // Value stored: { companyId, status: 'available', created: <ts> }
  // On claim: iOS hits GET /team/{code}, which reads from KV, marks as claimed,
  // and returns the current active cover config for the company.
  const writes = codes.map((code) =>
    env.TEAMS.put(
      `team:${String(code).toUpperCase()}`,
      JSON.stringify({
        companyId,
        status: 'available',
        created: Date.now(),
      })
    )
  );

  await Promise.all(writes);

  return json({ ok: true, written: codes.length });
}

// ─── Helpers (shared with asset-upload.js — define once in worker) ──

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
  });
}

async function hmacSha256Base64Url(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
