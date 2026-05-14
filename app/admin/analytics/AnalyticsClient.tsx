'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { GlassPanel, Stat, Whisper, Button, Badge } from '@/components/ui';

interface Props {
  ascConfigured: boolean;
  firebaseConfigured: boolean;
  ascLastSync: string | null;
  firebaseLastSync: string | null;
}

type Source = 'asc' | 'firebase';
type Range = 7 | 30 | 90 | 365;

interface Row {
  date: string;
  value: number;
  currency?: string | null;
}

/**
 * Analytics dashboard for Perenne admin. Renders cached AnalyticsSnapshot
 * rows. Each integration ("App Store Connect", "Firebase") gets a card
 * that shows either:
 *   • a "Not configured" empty state with a link to /admin/settings
 *   • a "Sync now" button + key-metric cards + an SVG sparkline
 */
export function AnalyticsClient({
  ascConfigured, firebaseConfigured,
  ascLastSync, firebaseLastSync,
}: Props) {
  const [range, setRange] = useState<Range>(30);
  const [syncing, setSyncing] = useState<Source | 'all' | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [ascInstalls, setAscInstalls] = useState<Row[]>([]);
  const [ascRevenue,  setAscRevenue]  = useState<Row[]>([]);
  const [fbDau,       setFbDau]       = useState<Row[]>([]);
  const [fbNewUsers,  setFbNewUsers]  = useState<Row[]>([]);
  const [fbEvents,    setFbEvents]    = useState<Row[]>([]);

  const fetchRows = useCallback(
    async (source: Source, metric: string, days: Range): Promise<Row[]> => {
      const res = await fetch(`/api/admin/analytics?source=${source}&metric=${metric}&days=${days}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.rows ?? [];
    },
    []
  );

  const loadAll = useCallback(async () => {
    const [installs, revenue, dau, newUsers, events] = await Promise.all([
      ascConfigured       ? fetchRows('asc', 'installs', range) : Promise.resolve([]),
      ascConfigured       ? fetchRows('asc', 'revenue', range)  : Promise.resolve([]),
      firebaseConfigured  ? fetchRows('firebase', 'dau', range)         : Promise.resolve([]),
      firebaseConfigured  ? fetchRows('firebase', 'new_users', range)   : Promise.resolve([]),
      firebaseConfigured  ? fetchRows('firebase', 'event_count', range) : Promise.resolve([]),
    ]);
    setAscInstalls(installs);
    setAscRevenue(revenue);
    setFbDau(dau);
    setFbNewUsers(newUsers);
    setFbEvents(events);
  }, [ascConfigured, firebaseConfigured, range, fetchRows]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function runSync(source: Source | 'all') {
    setSyncing(source);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/analytics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, days: range }),
      });
      const data = await res.json();
      if (data.errors && Object.keys(data.errors).length > 0) {
        setFlash({ type: 'err', msg: Object.values(data.errors).join(' · ') });
      } else {
        setFlash({ type: 'ok', msg: `Synced ${source}.` });
      }
      await loadAll();
    } catch {
      setFlash({ type: 'err', msg: 'Network error.' });
    } finally {
      setSyncing(null);
    }
  }

  const ascTotalInstalls = useMemo(
    () => ascInstalls.reduce((s, r) => s + r.value, 0),
    [ascInstalls]
  );
  const ascTotalRevenue = useMemo(
    () => ascRevenue.reduce((s, r) => s + r.value, 0),
    [ascRevenue]
  );
  const ascRevenueCurrency = ascRevenue[0]?.currency ?? 'EUR';

  const fbLatestDau = fbDau.length > 0 ? fbDau[fbDau.length - 1].value : 0;
  const fbAvgDau = fbDau.length > 0
    ? Math.round(fbDau.reduce((s, r) => s + r.value, 0) / fbDau.length)
    : 0;
  const fbTotalNewUsers = fbNewUsers.reduce((s, r) => s + r.value, 0);

  return (
    <>
      {flash && (
        <div
          className={`mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border ${
            flash.type === 'ok'
              ? 'bg-status-success border-status-success text-status-success'
              : 'bg-status-danger border-status-danger text-status-danger'
          }`}
        >
          {flash.type === 'ok' ? '✓ ' : '✕ '}{flash.msg}
        </div>
      )}

      {/* Range selector + sync-all */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div role="tablist" className="flex items-center gap-1 p-1 rounded-2xl border border-glass-border bg-surface-faint w-fit">
          {([7, 30, 90, 365] as Range[]).map((r) => {
            const active = range === r;
            return (
              <button
                key={r}
                role="tab"
                aria-selected={active}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  active ? 'bg-accent text-white shadow-sm' : 'text-ink-dim hover:text-ink hover:bg-surface-hover'
                }`}
              >
                Last {r}d
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        {(ascConfigured || firebaseConfigured) && (
          <Button
            variant="primary"
            onClick={() => runSync('all')}
            loading={syncing === 'all'}
            disabled={syncing !== null}
          >
            ↻ Sync all
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* App Store Connect card */}
        <SourceCard
          title="App Store Connect"
          subtitle="Installs · Revenue · iOS app"
          configured={ascConfigured}
          lastSync={ascLastSync}
          onSync={() => runSync('asc')}
          syncing={syncing === 'asc'}
          syncingAny={syncing !== null}
        >
          {ascConfigured ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Stat label={`Installs · ${range}d`} value={ascTotalInstalls.toLocaleString()} />
                <Stat
                  label={`Revenue · ${range}d`}
                  value={`${ascRevenueCurrency} ${ascTotalRevenue.toFixed(2)}`}
                  hint="developer proceeds"
                />
              </div>
              <Sparkline title="Daily installs" rows={ascInstalls} accent />
              <Sparkline title="Daily revenue" rows={ascRevenue} suffix={` ${ascRevenueCurrency}`} accent={false} />
            </>
          ) : (
            <ConfigureCta
              what="App Store Connect"
              fields="Key ID, Issuer ID, Vendor ID, P8 private key"
            />
          )}
        </SourceCard>

        {/* Firebase card */}
        <SourceCard
          title="Firebase Analytics"
          subtitle="Active users · New users · Events"
          configured={firebaseConfigured}
          lastSync={firebaseLastSync}
          onSync={() => runSync('firebase')}
          syncing={syncing === 'firebase'}
          syncingAny={syncing !== null}
        >
          {firebaseConfigured ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Stat label="DAU · latest" value={fbLatestDau.toLocaleString()} />
                <Stat label={`Avg DAU · ${range}d`} value={fbAvgDau.toLocaleString()} />
                <Stat label={`New users · ${range}d`} value={fbTotalNewUsers.toLocaleString()} />
              </div>
              <Sparkline title="Daily active users" rows={fbDau} accent />
              <Sparkline title="Daily events" rows={fbEvents} />
            </>
          ) : (
            <ConfigureCta
              what="Firebase Analytics"
              fields="GA4 Property ID, service account JSON"
            />
          )}
        </SourceCard>
      </div>
    </>
  );
}

function SourceCard({
  title, subtitle, configured, lastSync, onSync, syncing, syncingAny, children,
}: {
  title: string;
  subtitle: string;
  configured: boolean;
  lastSync: string | null;
  onSync: () => void;
  syncing: boolean;
  syncingAny: boolean;
  children: React.ReactNode;
}) {
  return (
    <GlassPanel padding="lg">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            <Badge tone={configured ? 'success' : 'neutral'}>
              {configured ? 'connected' : 'not configured'}
            </Badge>
          </div>
          <p className="text-[11px] text-ink-faint mt-0.5">{subtitle}</p>
          {lastSync && (
            <p className="text-[10px] text-ink-faint mt-1 font-mono">
              Last sync: {new Date(lastSync).toLocaleString()}
            </p>
          )}
        </div>
        {configured && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncingAny}
            className="text-[11px] px-2.5 py-1.5 rounded-lg border border-glass-border hover:border-accent text-ink-dim hover:text-accent transition disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : '↻ Sync'}
          </button>
        )}
      </div>
      {children}
    </GlassPanel>
  );
}

function ConfigureCta({ what, fields }: { what: string; fields: string }) {
  return (
    <div className="p-6 rounded-xl border border-glass-border bg-surface-faint text-center">
      <p className="text-xs text-ink-dim mb-1">
        {what} isn't connected yet.
      </p>
      <p className="text-[10px] text-ink-faint mb-4">
        Required: {fields}
      </p>
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-bright transition"
      >
        Go to Platform settings →
      </Link>
    </div>
  );
}

/**
 * Tiny SVG sparkline. Renders into the parent's width via viewBox.
 * Designed to look at home in our glass panel — uses accent for the
 * stroke and a soft gradient fill underneath.
 */
function Sparkline({
  title, rows, suffix = '', accent = false,
}: {
  title: string;
  rows: Row[];
  suffix?: string;
  accent?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-widest font-mono text-ink-faint">{title}</span>
        </div>
        <Whisper>No data yet — run sync.</Whisper>
      </div>
    );
  }

  const W = 480;
  const H = 80;
  const PAD_X = 4;
  const PAD_Y = 6;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const min = Math.min(...rows.map((r) => r.value), 0);
  const xStep = (W - PAD_X * 2) / Math.max(1, rows.length - 1);

  const pts = rows.map((r, i) => {
    const x = PAD_X + i * xStep;
    const y = H - PAD_Y - ((r.value - min) / Math.max(1, max - min)) * (H - PAD_Y * 2);
    return [x, y] as const;
  });

  const linePath = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;

  const last = rows[rows.length - 1];
  const total = rows.reduce((s, r) => s + r.value, 0);

  const stroke = accent ? 'var(--accent)' : 'var(--text-dim)';
  const fillFrom = accent ? 'var(--accent-glow)' : 'var(--glass-bg-hi)';

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] uppercase tracking-widest font-mono text-ink-faint">{title}</span>
        <span className="text-[11px] font-mono text-ink-dim">
          last <strong className="text-ink">{last.value.toLocaleString()}{suffix}</strong>
          {' · '}
          total <strong className="text-ink">{total.toLocaleString()}{suffix}</strong>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-20">
        <defs>
          <linearGradient id={`g-${title.replace(/\W+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={fillFrom} stopOpacity={0.4} />
            <stop offset="100%" stopColor={fillFrom} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#g-${title.replace(/\W+/g, '')})`} />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
