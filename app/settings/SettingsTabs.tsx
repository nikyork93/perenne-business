'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { GlassPanel } from '@/components/ui';
import { SettingsForm } from '@/components/SettingsForm';
import { TeamListClient } from '@/app/team/TeamListClient';
import { BrandAssetsPanel } from './BrandAssetsPanel';
import type { UserRole } from '@prisma/client';

type Tab = 'company' | 'users' | 'brand';

interface SettingsTabsProps {
  initialTab: Tab;
  company: {
    id: string;
    name: string;
    legalName: string | null;
    vatNumber: string | null;
    taxCode: string | null;
    address: string | null;
    city: string | null;
    zipCode: string | null;
    country: string | null;
    sdiCode: string | null;
    pecEmail: string | null;
    primaryColor: string | null;
    logoSymbolUrl: string | null;
    logoExtendedUrl: string | null;
  };
  canEditFiscal: boolean;
  currentUserId: string;
  currentUserRole: UserRole;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'company', label: 'Company info' },
  { id: 'users',   label: 'Users' },
  { id: 'brand',   label: 'Brand assets' },
];

export function SettingsTabs({
  initialTab,
  company,
  canEditFiscal,
  currentUserId,
  currentUserRole,
}: SettingsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>(initialTab);

  // Keep the URL in sync so deep links like /settings?tab=users work
  // both ways: arriving on the page selects the tab; clicking a tab
  // rewrites the URL without a navigation.
  function changeTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams();
    if (next !== 'company') params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div>
      {/* Tab bar — sits above the panel like the macOS Settings */}
      <div
        role="tablist"
        aria-label="Settings tabs"
        className="flex items-center gap-1 p-1 mb-4 rounded-2xl border border-glass-border bg-surface-faint w-fit"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => changeTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition ${
                active
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-ink-dim hover:text-ink hover:bg-surface-hover'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      {tab === 'company' && (
        <div className="max-w-2xl">
          <GlassPanel padding="lg">
            <SettingsForm company={company} canEditFiscal={canEditFiscal} />
          </GlassPanel>
        </div>
      )}

      {tab === 'users' && (
        <TeamListClient
          companyName={company.name}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />
      )}

      {tab === 'brand' && (
        <BrandAssetsPanel
          companyId={company.id}
          initialSymbolUrl={company.logoSymbolUrl}
          initialExtendedUrl={company.logoExtendedUrl}
          canEdit={currentUserRole === 'OWNER' || currentUserRole === 'ADMIN' || currentUserRole === 'SUPERADMIN'}
        />
      )}
    </div>
  );
}
