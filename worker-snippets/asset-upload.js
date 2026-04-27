// ════════════════════════════════════════════════════════════════
// PERENNE API WORKER — Asset upload endpoint
// Add this to your existing perenne-api worker source code.
//
// Endpoint: POST /assets/upload
// Auth:     HMAC-SHA256 signature header `x-perenne-signature`
//           Request body is multipart/form-data with:
//           - companyId: <cuid>   (form field)
//           - assetId:   <cuid>   (form field, for R2 key)
//           - file:      <blob>   (the actual file)
//
// R2 key pattern: teams/{companyId}/{assetId}/{filename}
// Public URL:     https://assets.perenne.app/{r2Key}
//
// HMAC verification:
//   header = base64url(HMAC_SHA256(PERENNE_API_SECRET, timestamp + ':' + companyId))
//   + `x-perenne-timestamp: <unix_ms>` header
//   Reject if timestamp > 60s old (replay protection).
// ════════════════════════════════════════════════════════════════

// Add these env bindings in wrangler.toml / dashboard:
//   PERENNE_API_SECRET  (secret, same value as portal env)
//   ASSETS              (R2 bucket binding, already configured)

/**
 * Paste this handler into your worker's main fetch() function,
 * after the existing routes:
 *
 * if (path === '/assets/upload' && request.method === 'POST') {
 *   return handleAssetUpload(request, env);
 * }
 */

export async function handleAssetUpload(request, env) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-perenne-signature, x-perenne-timestamp',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Verify HMAC signature + freshness ──────────────────────
  const signature = request.headers.get('x-perenne-signature');
  const timestamp = request.headers.get('x-perenne-timestamp');

  if (!signature || !timestamp) {
    return json({ error: 'Missing auth headers' }, 401);
  }

  const tsNum = parseInt(timestamp, 10);
  if (isNaN(tsNum)) return json({ error: 'Invalid timestamp' }, 401);

  const age = Date.now() - tsNum;
  if (age > 60_000 || age < -5_000) {
    return json({ error: 'Request too old (replay protection)' }, 401);
  }

  // Parse form data
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid multipart body' }, 400);
  }

  const companyId = formData.get('companyId');
  const assetId   = formData.get('assetId');
  const file      = formData.get('file');

  if (typeof companyId !== 'string' || !companyId) return json({ error: 'companyId required' }, 400);
  if (typeof assetId !== 'string' || !assetId)     return json({ error: 'assetId required' }, 400);
  if (!(file instanceof File))                      return json({ error: 'file required' }, 400);

  // Validate HMAC
  const payload = `${timestamp}:${companyId}`;
  const expected = await hmacSha256Base64Url(env.PERENNE_API_SECRET, payload);
  if (!safeCompare(expected, signature)) {
    return json({ error: 'Invalid signature' }, 401);
  }

  // ── Validate file ──────────────────────────────────────────
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    return json({ error: 'Unsupported file type. PNG/JPEG/WebP/SVG only.' }, 400);
  }
  const maxBytes = 5 * 1024 * 1024;  // 5 MB
  if (file.size > maxBytes) {
    return json({ error: 'File too large (max 5 MB)' }, 400);
  }

  // ── Upload to R2 ───────────────────────────────────────────
  // Sanitize filename: keep alphanumeric + . _ -
  const safeName = (file.name || 'asset').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const r2Key = `teams/${companyId}/${assetId}/${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  await env.ASSETS.put(r2Key, arrayBuffer, {
    httpMetadata: { contentType: file.type },
    customMetadata: { companyId, assetId, uploadedAt: String(Date.now()) },
  });

  const publicUrl = `https://assets.perenne.app/${r2Key}`;

  return json({
    ok: true,
    r2Key,
    url: publicUrl,
    sizeBytes: file.size,
    mimeType: file.type,
  });
}

// ─── Helpers ────────────────────────────────────────────────

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
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
