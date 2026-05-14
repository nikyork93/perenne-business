import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Return cached AnalyticsSnapshot rows for the dashboard. Super-admin
 * only. Query params:
 *   - source: "asc" | "firebase" (required)
 *   - metric: string (required)
 *   - days:   integer 1..365 (default 30)
 */
export async function GET(req: NextRequest) {
  await requireRole('SUPERADMIN');

  const sp = req.nextUrl.searchParams;
  const source = sp.get('source');
  const metric = sp.get('metric');
  const daysRaw = sp.get('days');
  const days = Math.max(1, Math.min(365, Number(daysRaw) || 30));

  if (!source || !metric) {
    return NextResponse.json({ error: 'source and metric are required' }, { status: 400 });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - days);

  const rows = await prisma.analyticsSnapshot.findMany({
    where: { source, metric, date: { gte: from, lte: today } },
    orderBy: { date: 'asc' },
  });

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      value: r.value,
      currency: r.currency,
    })),
  });
}
