'use client';

import { useState } from 'react';
import { PackageType } from '@prisma/client';
import { GlassPanel, Button, Badge } from '@/components/ui';
import { PRICING_TIERS, formatEuros, type PricingTier } from '@/lib/pricing';
import { cn } from '@/lib/cn';

export function StoreGrid() {
  const [loadingTier, setLoadingTier] = useState<PackageType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(tier: PricingTier) {
    if (tier.contactSales) {
      window.location.href = 'mailto:business@perenne.app?subject=Scale%20pack%20inquiry';
      return;
    }

    setLoadingTier(tier.id);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageType: tier.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout.');
        setLoadingTier(null);
        return;
      }
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      setError('Network error. Please try again.');
      setLoadingTier(null);
    }
  }

  return (
    <>
      {error && (
        <div className="mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-danger/5 border-danger/20 text-[#ff9a9a]">
          ✕ {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {PRICING_TIERS.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            loading={loadingTier === tier.id}
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
  onSelect,
}: {
  tier: PricingTier;
  loading: boolean;
  onSelect: () => void;
}) {
  return (
    <GlassPanel
      animate
      padding="lg"
      className={cn(
        'relative flex flex-col',
        tier.popular && 'ring-1 ring-accent/30'
      )}
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
      >
        {tier.contactSales ? 'Contact sales' : 'Buy pack'}
      </Button>
    </GlassPanel>
  );
}
