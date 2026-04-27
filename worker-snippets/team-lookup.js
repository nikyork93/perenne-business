// ════════════════════════════════════════════════════════════════
// PERENNE API WORKER — /team/{code} endpoint
// Called by: Perenne Note iOS app when user enters activation code.
// Purpose:   Validate code, mark as claimed, return cover config.
//
// This is the CONSUMER endpoint — no HMAC auth required (app has
// no way to sign requests).
//
// Auth model:
//   - Code itself is the secret (24 random chars).
//   - Only works once; after claim, same code returns 410 Gone.
//   - Device ID is recorded on claim; if re-activated on new device,
//     we could reject (uncomment the deviceMismatch check).
//
// Response shape for iOS TeamBrandManager:
// {
//   "company": "Acme Corp",
//   "logoURL":         "https://assets.perenne.app/...",  // compat: first asset
//   "logoSymbolURL":   "https://assets.perenne.app/...",
//   "logoExtendedURL": "https://assets.perenne.app/...",
//   "quote": "Property of Acme Corp",
//   "cover": {
//     "backgroundColor": "#1a1a1a",
//     "assets": [{ url, x, y, scale, rotation, opacity }]
//   }
// }
// ════════════════════════════════════════════════════════════════

export async function handleTeamLookup(request, env, code) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, x-device-id',
      },
    });
  }

  const codeUpper = String(code || '').toUpperCase();
  if (!/^PRN-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(codeUpper)) {
    return json({ error: 'Invalid code format' }, 400);
  }

  const kvKey = `team:${codeUpper}`;
  const rawEntry = await env.TEAMS.get(kvKey);
  if (!rawEntry) return json({ error: 'Invalid team code' }, 404);

  let entry;
  try { entry = JSON.parse(rawEntry); }
  catch { return json({ error: 'Corrupt entry' }, 500); }

  // Check if already claimed
  const deviceId = request.headers.get('x-device-id') || 'unknown';
  if (entry.status === 'claimed') {
    // Same device re-activation = allow (user reinstalled app)
    // Different device = reject
    if (entry.claimedDeviceId && entry.claimedDeviceId !== deviceId) {
      return json({ error: 'This code has already been activated on another device.' }, 410);
    }
    // same device — fall through and return current config
  }

  // Fetch cover config from company-level KV entry
  const companyKey = `company:${entry.companyId}`;
  const rawCompany = await env.TEAMS.get(companyKey);
  if (!rawCompany) {
    // Company cover not yet synced — return minimal response
    return json({
      company: 'Unknown',
      logoURL: null,
      quote: null,
      cover: { backgroundColor: '#1a1a1a', assets: [] },
    });
  }

  let company;
  try { company = JSON.parse(rawCompany); }
  catch { return json({ error: 'Corrupt company entry' }, 500); }

  // Mark as claimed (first time only)
  if (entry.status !== 'claimed') {
    entry.status = 'claimed';
    entry.claimedAt = Date.now();
    entry.claimedDeviceId = deviceId;
    await env.TEAMS.put(kvKey, JSON.stringify(entry));

    // Notify portal to update DB (fire-and-forget)
    if (env.PORTAL_WEBHOOK_URL && env.PERENNE_API_SECRET) {
      const ts = String(Date.now());
      const sig = await hmacSha256Base64Url(env.PERENNE_API_SECRET, `${ts}:${codeUpper}`);
      await fetch(`${env.PORTAL_WEBHOOK_URL}/api/codes/claimed`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-perenne-signature': sig,
          'x-perenne-timestamp': ts,
        },
        body: JSON.stringify({
          code: codeUpper,
          deviceId,
          claimedAt: entry.claimedAt,
        }),
      }).catch(() => null);
    }
  }

  // Build response for iOS
  const assets = company.cover?.assets ?? [];
  const response = {
    company: company.name,
    logoURL: assets[0]?.url ?? company.logoSymbolUrl ?? null,
    logoSymbolURL: company.logoSymbolUrl ?? null,
    logoExtendedURL: company.logoExtendedUrl ?? null,
    quote: company.cover?.quote?.text ?? (company.name ? `Property of ${company.name}` : null),
    colors: {
      primary: company.cover?.backgroundColor ?? '#1a1a1a',
      secondary: '#F2F2F6',
    },
    cover: {
      backgroundColor: company.cover?.backgroundColor ?? '#1a1a1a',
      assets: assets.map((a) => ({
        url: a.url,
        x: a.x,
        y: a.y,
        scale: a.scale,
        rotation: a.rotation,
        opacity: a.opacity,
      })),
      quote: company.cover?.quote ?? null,
    },
    // seats/expires reserved for V2 (subscription pack with expiration)
  };

  return json(response);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
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
