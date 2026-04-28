'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { PerenneLogo } from '@/components/layout/PerenneLogo';

const MAIN_NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/cover', label: 'Cover' },
  { href: '/codes', label: 'Codes' },
  { href: '/distribution', label: 'Distribution' },
  { href: '/store', label: 'Store' },
  { href: '/billing', label: 'Billing' },
];

const SETTINGS_NAV = [
  { href: '/team', label: 'Team' },
  { href: '/settings', label: 'Settings' },
];

const ADMIN_NAV = [
  { href: '/admin/companies', label: 'Companies' },
  { href: '/admin/revenue', label: 'Revenue' },
  { href: '/admin/audit', label: 'Audit log' },
];

interface ShellClientProps {
  user: {
    email: string;
    name: string | null;
    role: string;
    companyId: string | null;
  };
  children: ReactNode;
}

export function ShellClient({ user, children }: ShellClientProps) {
  const pathname = usePathname() || '/';
  const [mobileOpen, setMobileOpen] = useState(false);
  const isSuperAdmin = user?.role === 'SUPERADMIN';

  return (
    <div
      className="min-h-screen text-ink relative overflow-x-hidden"
      style={{
        // Rich layered background — base color + ambient glows.
        // This is what shows through the liquid-glass panels.
        background: `
          radial-gradient(ellipse 80% 60% at 15% 20%, rgba(74,122,140,0.25) 0%, transparent 60%),
          radial-gradient(ellipse 70% 50% at 85% 80%, rgba(44,88,104,0.20) 0%, transparent 60%),
          radial-gradient(ellipse 50% 40% at 50% 50%, rgba(90,146,168,0.08) 0%, transparent 60%),
          linear-gradient(180deg, #0a0a0f 0%, #0f0f15 100%)
        `,
      }}
    >
      {/* ─── Sidebar (desktop) + drawer (mobile) ─── */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex-col transition-transform duration-200 ease-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 md:flex flex`}
        style={{
          background: 'rgba(15, 15, 20, 0.55)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="flex items-center justify-between p-6 border-b border-glass-border">
          <Link
            href="/dashboard"
            className="text-ink hover:text-ink transition"
            onClick={() => setMobileOpen(false)}
          >
            <PerenneLogo variant="extended" height={22} />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-ink-faint hover:text-ink text-xl leading-none px-2"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          <NavSection items={MAIN_NAV} pathname={pathname} onNav={() => setMobileOpen(false)} />
          <NavSection
            title="Workspace"
            items={SETTINGS_NAV}
            pathname={pathname}
            onNav={() => setMobileOpen(false)}
          />
          {isSuperAdmin && (
            <NavSection
              title="Superadmin"
              items={ADMIN_NAV}
              pathname={pathname}
              onNav={() => setMobileOpen(false)}
            />
          )}
        </nav>

        <div className="p-4 border-t border-glass-border">
          <div
            className="rounded-2xl p-3"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-1">
              {isSuperAdmin ? 'Superadmin' : (user?.role || 'User')}
            </div>
            <div className="text-xs text-ink truncate" title={user?.email || ''}>
              {user?.name || user?.email || 'Unknown'}
            </div>
            <Link
              href="/api/auth/logout"
              className="block mt-2 text-[11px] text-ink-faint hover:text-ink transition font-mono"
            >
              Sign out →
            </Link>
          </div>
        </div>
      </aside>

      {/* ─── Mobile top bar ─── */}
      <header
        className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{
          background: 'rgba(15, 15, 20, 0.55)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="text-ink-dim hover:text-ink text-xl"
          aria-label="Open menu"
        >
          ☰
        </button>
        <PerenneLogo variant="extended" height={18} />
        <div className="w-6" />
      </header>

      {/* ─── Main content ─── */}
      <main className="md:pl-64 min-h-screen">
        <div className="max-w-7xl mx-auto p-6 md:p-10">{children}</div>
      </main>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </div>
  );
}

interface NavSectionProps {
  title?: string;
  items: { href: string; label: string }[];
  pathname: string;
  onNav: () => void;
}

function NavSection({ title, items, pathname, onNav }: NavSectionProps) {
  return (
    <div>
      {title && (
        <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase px-3 mb-2">
          {title}
        </div>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNav}
                className={`block px-3 py-2 rounded-xl text-sm transition-all ${
                  active
                    ? 'bg-accent-soft text-ink border border-accent/30'
                    : 'text-ink-dim hover:text-ink hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
