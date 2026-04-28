'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { PerenneLogo } from '@/components/layout/PerenneLogo';

interface ShellProps {
  children: React.ReactNode;
  companyName?: string;
  userEmail: string;
  isSuperAdmin?: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon?: string;
  badge?: string;
}

const MAIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Cover Editor', href: '/cover' },
  { label: 'Store', href: '/store' },
  { label: 'Codes', href: '/codes' },
  { label: 'Distribution', href: '/distribution' },
  { label: 'Billing', href: '/billing' },
];

const SETTINGS_NAV: NavItem[] = [
  { label: 'Company', href: '/settings' },
  { label: 'Team', href: '/team' },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Companies', href: '/admin/companies' },
  { label: 'Revenue', href: '/admin/revenue' },
  { label: 'Audit Log', href: '/admin/audit' },
];

export function Shell({ children, companyName, userEmail, isSuperAdmin }: ShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout failed', err);
    }
    window.location.href = '/login';
  }

  return (
    <div className="min-h-screen bg-ink-bg flex">
      {/* mobile menu toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-9 h-9 rounded-lg border border-glass-border bg-glass-base/80 backdrop-blur flex items-center justify-center text-ink hover:bg-white/[0.06]"
        aria-label="Toggle navigation"
      >
        <span className="text-lg leading-none">{mobileOpen ? '×' : '☰'}</span>
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static lg:translate-x-0 inset-y-0 left-0 w-64 bg-glass-base/40 border-r border-glass-border backdrop-blur-xl z-40 transition-transform duration-200 flex flex-col',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="p-5 border-b border-glass-border">
          <Link href="/dashboard" className="block text-ink hover:text-accent transition-colors">
            <PerenneLogo variant="extended" height={22} />
          </Link>
          <div className="mt-2 text-[10px] font-mono text-ink-faint uppercase tracking-wider">
            Business
          </div>
        </div>

        {/* Company badge */}
        {companyName && (
          <div className="px-5 py-3 border-b border-glass-border">
            <div className="text-[10px] font-mono text-ink-faint uppercase tracking-wider mb-1">
              Company
            </div>
            <div className="text-sm font-display italic text-ink truncate">
              {companyName}
            </div>
          </div>
        )}

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {!isSuperAdmin || pathname.startsWith('/admin') === false ? (
            <>
              <NavSection items={MAIN_NAV} pathname={pathname} isActive={isActive} onClick={() => setMobileOpen(false)} />
              <NavSection title="Settings" items={SETTINGS_NAV} pathname={pathname} isActive={isActive} onClick={() => setMobileOpen(false)} />
            </>
          ) : null}

          {isSuperAdmin && (
            <NavSection title="Superadmin" items={ADMIN_NAV} pathname={pathname} isActive={isActive} onClick={() => setMobileOpen(false)} />
          )}
        </nav>

        {/* Footer / user */}
        <div className="p-3 border-t border-glass-border">
          <div className="px-2 py-2 mb-1">
            <div className="text-[10px] font-mono text-ink-faint uppercase tracking-wider mb-1">
              Signed in
            </div>
            <div className="text-[11px] text-ink-dim truncate">{userEmail}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-[11px] font-mono text-ink-faint hover:text-ink hover:bg-white/[0.04] rounded-md transition"
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* Backdrop on mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/40 z-30"
        />
      )}

      {/* Main */}
      <main className="flex-1 lg:ml-0 px-6 py-8 lg:px-10 lg:py-10 overflow-x-auto">
        {children}
      </main>
    </div>
  );
}

function NavSection({
  title,
  items,
  pathname,
  isActive,
  onClick,
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
  isActive: (href: string) => boolean;
  onClick: () => void;
}) {
  return (
    <div>
      {title && (
        <div className="px-3 mb-2 text-[10px] font-mono text-ink-faint uppercase tracking-wider">
          {title}
        </div>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onClick}
                className={cn(
                  'flex items-center px-3 py-2 text-xs rounded-md transition',
                  active
                    ? 'bg-white/[0.07] text-ink font-medium'
                    : 'text-ink-dim hover:text-ink hover:bg-white/[0.04]'
                )}
              >
                {item.label}
                {item.badge && (
                  <span className="ml-auto text-[10px] font-mono text-accent">{item.badge}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
