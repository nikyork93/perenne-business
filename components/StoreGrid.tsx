'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PackageType } from '@prisma/client';
import { GlassPanel, Button, Badge, Select, Whisper } from '@/components/ui';
import { PRICING_TIERS, formatEuros, type PricingTier } from '@/lib/pricing';
import { cn } from '@/lib/cn';

// Lightweight design summary passed from the server. Mirrors the
// shape used in /designs but only with what the store actually needs.
export interface StoreDesignOption {
  id: string;
  name: string;
  isDefault: boolean;
}

interface StoreGridProps {
  /**
   * Active (non-archived) designs available for selection. Order:
   * default first, then most-recently-updated. The first one is the
   * pre-selected option.
   */
  designs: StoreDesignOption[];
}

export function StoreGrid({ designs }: StoreGridProps) {
  const [loadingTier, setLoadingTier] = useState<PackageType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-select the default design if there is one, else the first.
  // If `designs` is empty (no defaults configured), the first checkout
  // attempt will surface the server's error message and we link the
  // user to /designs/new.
  const [designId, setDesignId] = useState<string>(() => {
    const def = designs.find((d) => d.isDefault);
    return def?.id ?? designs[0]?.id ?? '';
  });

  async function handleCheckout(tier: PricingTier) {
    if (tier.contactSales) {
      window.location.href =
        'mailto:business@perenne.app?subject=Scale%20pack%20inquiry';
      return;
    }

    setLoadingTier(tier.id);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageType: tier.id,
          // designId is OPTIONAL on the server; if omitted, server
          // falls back to the company's default. We send it explicitly
          // when the user picked one in the dropdown so they always
          // get exactly what's previewed.
          designId: designId || undefined,
        }),
      });
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        const text = await res.text().catch(() => '');
        console.error('[checkout] non-JSON response', {
          status: res.status,
          bodyPreview: text.slice(0, 300),
        });
        setError(`Server returned ${res.status} ${res.statusText}.`);
        setLoadingTier(null);
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout.');
        setLoadingTier(null);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      console.error('[checkout] fetch failed', err);
      setError(err instanceof Error ? err.message : 'Network error');
      setLoadingTier(null);
    }
  }

  const hasDesigns = designs.length > 0;

  return (
    <>
      {error && (
        <div className="mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-danger/5 border-danger/20 text-[#ff9a9a]">
          ✕ {error}
        </div>
      )}

      {/* ── Design picker — sits above the grid ─────────────────── */}
      <GlassPanel padding="md" animate className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <Select
              label="Design for this batch"
              hint={hasDesigns ? `${designs.length} available` : undefined}
              value={designId}
              onChange={(e) => setDesignId(e.target.value)}
              disabled={!hasDesigns}
            >
              {hasDesigns ? (
                designs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.isDefault ? ' · default' : ''}
                  </option>
                ))
              ) : (
                <option value="">No designs available</option>
              )}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            {hasDesigns ? (
              <Whisper>
                The codes you buy will be permanently locked to this design.
                Editing the design later won&apos;t affect them.
              </Whisper>
            ) : (
              <div className="flex items-start gap-3">
                <Whisper>
                  You don&apos;t have any designs yet. Create one before
                  buying codes.
                </Whisper>
                <Link href="/designs/new">
                  <Button variant="primary" size="sm">
                    + New design
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {PRICING_TIERS.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            loading={loadingTier === tier.id}
            // Disable purchase if no design is selected (prevents the
            // server-error-after-Stripe-redirect failure mode).
            disabled={!hasDesigns && !tier.contactSales}
            onSelect={() => handleCheckout(tier)}
          />
        ))}
      </div>
    </>
  );
}

function TierCard({
  tier,
  loading,
  disabled,
  onSelect,
}: {
  tier: PricingTier;
  loading: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <GlassPanel
      animate
      padding="lg"
      className={cn('relative flex flex-col', tier.popular && 'ring-1 ring-accent/30')}
    >
      {tier.popular && (
        <div className="absolute -top-2.5 left-5">
          <Badge tone="accent">Most popular</Badge>
        </div>
      )}

      <div>
        <div className="label mb-2">{tier.name}</div>
        <p className="text-xs text-ink-dim leading-relaxed min-h-[34px]">
          {tier.tagline}
        </p>
      </div>

      <div className="my-6">
        {tier.contactSales ? (
          <>
            <div className="font-display italic text-[40px] leading-none tracking-tight">
              Custom
            </div>
            <div className="mt-2 text-[11px] text-ink-faint font-mono">
              Contact sales for quote
            </div>
          </>
        ) : (
          <>
            <div className="font-display italic text-[44px] leading-none tracking-tight">
              {formatEuros(tier.priceCents)}
            </div>
            <div className="mt-2 text-[11px] text-ink-faint font-mono">
              {tier.quantity} codes · {formatEuros(tier.pricePerCodeCents)} each
            </div>
          </>
        )}
      </div>

      <ul className="space-y-2.5 mb-8 flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13px] text-ink-dim">
            <span className="text-accent mt-0.5">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Button
        block
        variant={tier.popular ? 'primary' : 'default'}
        onClick={onSelect}
        loading={loading}
        disabled={disabled}
      >
        {tier.contactSales ? 'Contact sales' : 'Buy pack'}
      </Button>
    </GlassPanel>
  );
}
