import { SignJWT, importPKCS8 } from 'jose';
import { prisma } from '@/lib/prisma';

/**
 * Firebase Analytics integration via the Google Analytics Data API.
 *
 * Firebase Analytics for iOS pipes events into a GA4 property; we use
 * the GA4 Data API (analyticsdata.googleapis.com) which exposes daily
 * metrics like activeUsers (DAU) and eventCount.
 *
 * Auth is a service-account JWT exchanged for an OAuth2 access token.
 * Credentials live in AdminSettings.fb_serviceAccountJson — paste the
 * JSON the customer downloads from Google Cloud IAM.
 */

export interface FirebaseCredentials {
  /** Parsed service-account JSON: client_email + private_key (+ token_uri) */
  serviceAccount: ServiceAccount;
  /** GA4 property id, numeric (NOT the measurement id). e.g. "412345678" */
  propertyId: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

async function makeAccessToken(sa: ServiceAccount): Promise<string> {
  const key = await importPKCS8(sa.private_key, 'RS256');
  const iat = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(key);

  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

/** Run a runReport query against the GA4 Data API */
async function ga4RunReport(
  creds: FirebaseCredentials,
  body: object,
): Promise<{ rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }> {
  const token = await makeAccessToken(creds.serviceAccount);
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${creds.propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GA4 ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Fetch DAU + new users + 7-day rolling MAU for the given date range
 * and persist daily rows to AnalyticsSnapshot.
 */
export async function firebaseSyncRecent(creds: FirebaseCredentials, days = 30): Promise<{ written: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - days);

  const dateRange = {
    startDate: from.toISOString().slice(0, 10),
    endDate:   today.toISOString().slice(0, 10),
  };

  const res = await ga4RunReport(creds, {
    dateRanges: [dateRange],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'newUsers' },
      { name: 'eventCount' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });

  let written = 0;
  for (const row of res.rows ?? []) {
    const rawDate = row.dimensionValues[0].value; // "YYYYMMDD"
    const date = new Date(`${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`);
    const dau     = Number(row.metricValues[0].value) || 0;
    const newU    = Number(row.metricValues[1].value) || 0;
    const events  = Number(row.metricValues[2].value) || 0;

    const triples: [string, number][] = [
      ['dau',         dau],
      ['new_users',   newU],
      ['event_count', events],
    ];
    for (const [metric, value] of triples) {
      await prisma.analyticsSnapshot.upsert({
        where: { source_metric_date: { source: 'firebase', metric, date } },
        create: { source: 'firebase', metric, date, value },
        update: { value, fetchedAt: new Date() },
      });
      written++;
    }
  }

  await prisma.adminSettings.update({
    where: { id: 'default' },
    data: { fb_lastSyncAt: new Date() },
  });

  return { written };
}

export async function firebaseReadCached(
  metric: 'dau' | 'new_users' | 'event_count',
  fromDate: Date,
  toDate: Date,
): Promise<{ date: string; value: number }[]> {
  const rows = await prisma.analyticsSnapshot.findMany({
    where: {
      source: 'firebase',
      metric,
      date: { gte: fromDate, lte: toDate },
    },
    orderBy: { date: 'asc' },
  });
  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    value: r.value,
  }));
}
