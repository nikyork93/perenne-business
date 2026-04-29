'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

interface ShellProps {
  children: React.ReactNode;
  companyName?: string;
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
  { href: '/admin/users',     label: 'Users' },
  { href: '/admin/revenue',   label: 'Revenue' },
  { href: '/admin/audit',     label: 'Audit log' },
];

const SETTINGS_NAV: NavItem[] = [
  { href: '/team',     label: 'Team' },
  { href: '/settings', label: 'Settings' },
];

/**
 * Inline Perenne brand mark — small SVG, no external dependency.
 * Renders a teal-tinted "P" inside a glass disk, matching the app aura.
 */
function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="bm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4a7a8c" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#4a7a8c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#bm-glow)" />
      <circle
        cx="16"
        cy="16"
        r="14"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontFamily="serif"
        fontStyle="italic"
        fontSize="18"
        fontWeight="500"
        fill="currentColor"
      >
        P
      </text>
    </svg>
  );
}

export function Shell({ children, companyName, userEmail, isSuperAdmin }: ShellProps) {
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
        {/* Brand */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <BrandMark className="w-7 h-7 text-ink group-hover:text-accent transition" />
            <div className="leading-tight">
              <div className="font-display italic text-[15px] text-ink group-hover:text-accent transition">
                Perenne
              </div>
              <div className="text-[9px] tracking-[0.18em] uppercase text-ink-faint font-mono">
                Business
              </div>
            </div>
          </Link>
        </div>

        {/* Company badge */}
        {companyName && (
          <div className="px-5 py-3 border-b text-[10px]" style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="text-ink-faint uppercase tracking-[0.2em] mb-1 font-mono">Workspace</div>
            <div className="text-ink-dim truncate">{companyName}</div>
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

        {/* ── BOTTOM: Theme toggle + User + Logout ─────────────── */}
        <div
          className="px-3 py-3 space-y-2 border-t"
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          {/* Theme toggle — sidebar bottom */}
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
