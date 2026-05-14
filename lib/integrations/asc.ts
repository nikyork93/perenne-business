import { SignJWT, importPKCS8 } from 'jose';
import { gunzipSync } from 'zlib';
import { prisma } from '@/lib/prisma';

/**
 * App Store Connect integration.
 *
 * Two surfaces are useful for the analytics dashboard:
 *   • Sales Reports API: daily installs/units/proceeds per app — gzipped TSV
 *   • Analytics Reports API: granular daily metrics including downloads
 *
 * We use the Sales Reports endpoint because it's the documented, stable
 * way to get installs + revenue per day for one app. Returns one row
 * per (app version, country, date) — we aggregate by date in code.
 *
 * Auth: a short-lived JWT signed with the customer's P8 private key.
 * Credentials live in AdminSettings (configured via /admin/settings).
 */

export interface AscCredentials {
  keyId: string;
  issuerId: string;
  privateKeyPem: string;
  vendorId: string;
  appId?: string;
}

export interface AscDailyRow {
  date: string;      // YYYY-MM-DD
  installs: number;  // first-time downloads + redownloads
  proceeds: number;  // net of Apple commission, in `currency`
  currency: string;  // e.g. "EUR"
}

const TOKEN_TTL_SECONDS = 19 * 60; // Apple max is 20 min

/**
 * Fetch a JWT for the Sales Reports endpoint. The audience differs
 * from the standard "appstoreconnect-v1" we'd use for the App Store
 * Connect REST API.
 */
async function makeToken(creds: AscCredentials): Promise<string> {
  const key = await importPKCS8(creds.privateKeyPem, 'ES256');
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: creds.keyId, typ: 'JWT' })
    .setIssuer(creds.issuerId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS)
    .setAudience('appstoreconnect-v1')
    .sign(key);
}

/**
 * Pull from /v1/salesReports for a single day (DAILY frequency).
 * Returns the parsed daily rollup, or null when the report isn't
 * available yet (Apple publishes with ~24-48h lag).
 *
 * The API returns gzipped TSV; we decompress and parse here.
 */
export async function ascFetchDailyReport(
  creds: AscCredentials,
  isoDate: string,           // "YYYY-MM-DD"
): Promise<AscDailyRow | null> {
  const token = await makeToken(creds);
  const url = new URL('https://api.appstoreconnect.apple.com/v1/salesReports');
  url.searchParams.set('filter[frequency]', 'DAILY');
  url.searchParams.set('filter[reportType]', 'SALES');
  url.searchParams.set('filter[reportSubType]', 'SUMMARY');
  url.searchParams.set('filter[vendorNumber]', creds.vendorId);
  url.searchParams.set('filter[reportDate]', isoDate);
  url.searchParams.set('filter[version]', '1_1');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' },
  });

  // 404 = report not yet available for that date. Treat as "no data".
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ASC ${res.status}: ${body.slice(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const tsv = gunzipSync(buf).toString('utf-8');

  // Parse TSV; first line is header. Columns are documented at
  // https://developer.apple.com/help/app-store-connect/reference/sales-and-trends-reports/
  const lines = tsv.split('\n').filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].split('\t');
  const idxUnits      = header.indexOf('Units');
  const idxProceeds   = header.indexOf('Developer Proceeds');
  const idxCurrency   = header.indexOf('Customer Currency');
  const idxAppleId    = header.indexOf('Apple Identifier');

  let installs = 0;
  let proceeds = 0;
  let currency = 'USD';

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (creds.appId && cols[idxAppleId] && cols[idxAppleId] !== creds.appId) continue;
    installs += Number(cols[idxUnits])      || 0;
    proceeds += Number(cols[idxProceeds])   || 0;
    if (cols[idxCurrency]) currency = cols[idxCurrency];
  }

  return { date: isoDate, installs, proceeds, currency };
}

/**
 * Hydrate the AnalyticsSnapshot cache for the last N days.
 * Returns the number of new rows written.
 */
export async function ascSyncRecent(creds: AscCredentials, days = 30): Promise<{ written: number; missing: string[] }> {
  const missing: string[] = [];
  let written = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let offset = 1; offset <= days; offset++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - offset);
    const iso = d.toISOString().slice(0, 10);

    try {
      const row = await ascFetchDailyReport(creds, iso);
      if (!row) {
        missing.push(iso);
        continue;
      }
      await prisma.analyticsSnapshot.upsert({
        where: { source_metric_date: { source: 'asc', metric: 'installs', date: new Date(iso) } },
        create: { source: 'asc', metric: 'installs', date: new Date(iso), value: row.installs },
        update: { value: row.installs, fetchedAt: new Date() },
      });
      await prisma.analyticsSnapshot.upsert({
        where: { source_metric_date: { source: 'asc', metric: 'revenue',  date: new Date(iso) } },
        create: { source: 'asc', metric: 'revenue',  date: new Date(iso), value: row.proceeds, currency: row.currency },
        update: { value: row.proceeds, currency: row.currency, fetchedAt: new Date() },
      });
      written += 2;
    } catch (e) {
      // Log but continue — one bad day shouldn't break the whole sync.
      console.error(`[ASC] failed to fetch ${iso}:`, e instanceof Error ? e.message : e);
      missing.push(iso);
    }
  }

  await prisma.adminSettings.update({
    where: { id: 'default' },
    data: { asc_lastSyncAt: new Date() },
  });

  return { written, missing };
}

/**
 * Read cached daily rows for a date range from the DB. This is what
 * the dashboard renders — fast, no API call.
 */
export async function ascReadCached(
  metric: 'installs' | 'revenue',
  fromDate: Date,
  toDate: Date,
): Promise<{ date: string; value: number; currency?: string | null }[]> {
  const rows = await prisma.analyticsSnapshot.findMany({
    where: {
      source: 'asc',
      metric,
      date: { gte: fromDate, lte: toDate },
    },
    orderBy: { date: 'asc' },
  });
  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    value: r.value,
    currency: r.currency,
  }));
}
