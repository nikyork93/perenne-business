'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { GlassPanel } from '../ui/GlassPanel';

interface ShellProps {
  children: ReactNode;
  /** Company name shown at top of sidebar */
  companyName?: string;
  /** Email of the logged-in user */
  userEmail?: string;
  /** Show admin-only items */
  isSuperAdmin?: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',    icon: '◇' },
  { label: 'Cover Editor', href: '/cover',        icon: '✦' },
  { label: 'Store',        href: '/store',        icon: '◯' },
  { label: 'Codes',        href: '/codes',        icon: '≡' },
  { label: 'Distribution', href: '/distribution', icon: '→' },
  { label: 'Billing',      href: '/billing',      icon: '¤' },
  { label: 'Team',         href: '/team',         icon: '◍' },
  { label: 'Settings',     href: '/settings',     icon: '⚙' },
];

const ADMIN_ITEMS: NavItem[] = [
  { label: 'Companies', href: '/admin/companies', icon: '▢', adminOnly: true },
  { label: 'Revenue',   href: '/admin/revenue',   icon: '▲', adminOnly: true },
  { label: 'Audit Log', href: '/admin/audit',     icon: '◉', adminOnly: true },
];

export function Shell({ children, companyName, userEmail, isSuperAdmin }: ShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr] gap-3.5 p-3.5">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <GlassPanel animate padding="lg" className="flex flex-col gap-8 overflow-y-auto">
        {/* Brand */}
        <div>
          <div className="font-display italic text-[22px] leading-none tracking-tight">
            Perenne
          </div>
          <div className="label mt-1">Business</div>
        </div>

        {/* Company context */}
        {companyName && (
          <div>
            <div className="label mb-2">Company</div>
            <div className="text-sm text-ink">{companyName}</div>
          </div>
        )}

        {/* Main nav */}
        <nav>
          <div className="label mb-3">Workspace</div>
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(item.href + '/')} />
            ))}
          </ul>
        </nav>

        {/* Admin nav */}
        {isSuperAdmin && (
          <nav>
            <div className="label mb-3 text-accent/70">Superadmin</div>
            <ul className="flex flex-col gap-0.5">
              {ADMIN_ITEMS.map((item) => (
                <NavLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(item.href + '/')} />
              ))}
            </ul>
          </nav>
        )}

        {/* User footer */}
        {userEmail && (
          <div className="mt-auto pt-4 border-t border-glass-border">
            <div className="label mb-1">Signed in as</div>
            <div className="text-[11px] text-ink-dim font-mono truncate" title={userEmail}>
              {userEmail}
            </div>
            <Link href="/api/auth/logout" className="text-[11px] text-ink-faint hover:text-ink mt-2 inline-block">
              Sign out →
            </Link>
          </div>
        )}
      </GlassPanel>

      {/* ── Content ─────────────────────────────────────── */}
      <main className="min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all',
          active
            ? 'bg-white/[0.08] text-ink border border-glass-hairline'
            : 'text-ink-dim border border-transparent hover:bg-white/[0.04] hover:text-ink'
        )}
      >
        <span className={cn('w-4 text-center text-sm', active ? 'text-accent' : 'text-ink-faint')}>
          {item.icon}
        </span>
        <span>{item.label}</span>
      </Link>
    </li>
  );
}
