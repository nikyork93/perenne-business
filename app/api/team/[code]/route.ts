import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/team/[code]
 *
 * Stub — returns 404 for everything.
 *
 * The legacy Cloudflare Worker had this endpoint serving manual codes
 * (STLV test) from KV. The Worker is being dismissed and we don't have
 * any real legacy codes to preserve. New codes go through the Stripe
 * checkout → /store → NotebookCode flow.
 *
 * If/when we need legacy codes again (partner gifts, demos, etc.) we'll
 * re-introduce DB lookups here. For now this exists only so the
 * middleware host rewrite (api.perenne.app/team/* → /api/team/*) has
 * a route to land on instead of timing out.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Invalid team code' },
    {
      status: 404,
      headers: {
        'cache-control': 'public, s-maxage=60',
      },
    }
  );
}
