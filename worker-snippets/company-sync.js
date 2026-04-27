// ════════════════════════════════════════════════════════════════
// PERENNE API WORKER — /companies/sync
// Called by: portal webhook after /api/cover save.
// Purpose:   Sync Company + active CoverConfig to KV so iOS
//            /team/{code} reads instantly.
//
// Auth: HMAC (same scheme as other portal→worker calls)
// Body: {
//   companyId: string,
//   company: {
//     name, logoSymbolUrl, logoExtendedUrl,
//     cover: { backgroundColor, assets: [...], quote? },
//     seats, expires
//   }
// }
// ════════════════════════════════════════════════════════════════

export async function handleCompanySync(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const signature = request.headers.get('x-perenne-signature');
  const timestamp = request.headers.get('x-perenne-timestamp');
  if (!signature || !timestamp) return json({ error: 'Missing auth' }, 401);

  const tsNum = parseInt(timestamp, 10);
  if (isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 60_000) {
    return json({ error: 'Invalid timestamp' }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { companyId, company } = body;
  if (typeof companyId !== 'string' || !company) {
    return json({ error: 'companyId and company required' }, 400);
  }

  const expected = await hmacSha256Base64Url(env.PERENNE_API_SECRET, `${timestamp}:${companyId}`);
  if (!safeCompare(expected, signature)) {
    return json({ error: 'Invalid signature' }, 401);
  }

  // Write Company KV entry
  await env.TEAMS.put(`company:${companyId}`, JSON.stringify({
    ...company,
    updatedAt: Date.now(),
  }));

  return json({ ok: true, companyId });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
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
