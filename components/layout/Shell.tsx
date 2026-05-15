'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { PerenneLogo } from '@/components/layout/PerenneLogo';

interface ShellProps {
  children: React.ReactNode;
  companyName?: string | null;
  /** Optional R2 URL for the company's compact symbol logo. */
  companyLogoUrl?: string | null;
  userEmail?: string;
  isSuperAdmin?: boolean;
}

interface NavItem {
  href: string;
  label: string;
}

const MAIN_NAV: NavItem[] = [
  { href: '/dashboard',    label: 'Dashboard' },
  { href: '/cover',        label: 'Cover' },
  { href: '/codes',        label: 'Codes' },
  { href: '/distribution', label: 'Distribution' },
  { href: '/store',        label: 'Store' },
  { href: '/billing',      label: 'Billing' },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin/companies', label: 'Companies' },
  { href: '/admin/orders',    label: 'Orders' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/users',     label: 'Users' },
  { href: '/admin/revenue',   label: 'Revenue' },
  { href: '/admin/audit',     label: 'Audit log' },
  { href: '/admin/settings',  label: 'Platform settings' },
];

const SETTINGS_NAV: NavItem[] = [
  { href: '/settings', label: 'Settings' },
];

export function Shell({ children, companyName, companyLogoUrl, userEmail, isSuperAdmin }: ShellProps) {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  const hasCompany = Boolean(companyName);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── SIDEBAR ──────────────────────────────────────────────── */}
      <aside
        className="w-[240px] flex flex-col h-screen sticky top-0 border-r"
        style={{
          background: 'var(--sidebar-bg)',
          borderColor: 'var(--sidebar-border)',
          backdropFilter: 'blur(40px) saturate(180%)',
        }}
      >
        {/* Brand — Perenne Note logo extended */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
          <Link href="/dashboard" className="block group text-ink hover:text-accent transition-colors">
            <PerenneLogo variant="extended" height={22} />
          </Link>
          <div className="mt-2 text-[10px] tracking-[0.22em] uppercase text-ink-faint font-mono">
            Business
          </div>
        </div>

        {/* Company badge — workspace label + name; small inline logo
           (no background, no frame) if the company configured one. */}
        {companyName && (
          <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="text-[10px] text-ink-faint uppercase tracking-[0.2em] mb-1.5 font-mono">
              Workspace
            </div>
            <div className="flex items-center gap-2.5">
              {companyLogoUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={companyLogoUrl}
                  alt=""
                  className="flex-shrink-0 max-w-[22px] max-h-[22px] object-contain"
                />
              )}
              <div
                className="text-[12px] text-ink-dim truncate"
                title={companyName}
              >
                {companyName}
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {hasCompany && <NavSection items={MAIN_NAV} pathname={pathname} />}

          {isSuperAdmin && (
            <div>
              <div className="px-3 mb-2 text-[9px] tracking-[0.22em] uppercase text-ink-faint font-mono">
                Superadmin
              </div>
              <NavSection items={ADMIN_NAV} pathname={pathname} />
            </div>
          )}

          {hasCompany && (
            <div>
              <div className="px-3 mb-2 text-[9px] tracking-[0.22em] uppercase text-ink-faint font-mono">
                Settings
              </div>
              <NavSection items={SETTINGS_NAV} pathname={pathname} />
            </div>
          )}
        </nav>

        {/* ── BOTTOM: Theme + User + Logout ─────────────── */}
        <div
          className="px-3 py-3 space-y-2 border-t"
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          <ThemeToggle />

          {userEmail && (
            <div className="px-3 py-1.5 text-[10px] text-ink-faint font-mono truncate">
              {userEmail}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full px-3 py-2 rounded-lg border border-glass-border bg-surface-faint hover:bg-surface-hover hover:border-glass-hairline transition text-[11px] font-mono text-ink-dim hover:text-ink text-left disabled:opacity-50"
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────── */}
      <main className="flex-1 px-8 py-8 overflow-x-hidden">{children}</main>
    </div>
  );
}

function NavSection({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded-lg text-xs transition ${
              active
                ? 'bg-accent-soft text-accent border border-accent/20'
                : 'text-ink-dim hover:text-ink hover:bg-surface-faint border border-transparent'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
