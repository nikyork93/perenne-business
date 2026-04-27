import { PackageType } from '@prisma/client';

/**
 * Pricing configuration for Perenne Business notebook packs.
 *
 * All prices in CENTS (EUR) to match Stripe convention.
 * Example: 4900 = €49.00
 *
 * To change prices: edit this file, redeploy.
 * (Stripe Products are created dynamically via Checkout's price_data,
 * so we don't need to sync with Stripe Dashboard for simple one-time prices.)
 */

export interface PricingTier {
  id: PackageType;
  name: string;
  tagline: string;
  quantity: number;
  /** Total price for the whole pack, in EUR cents */
  priceCents: number;
  /** Derived: price per single code, shown as €X.XX */
  pricePerCodeCents: number;
  /** Display highlights shown on pricing card */
  features: string[];
  /** One pack is marked as "most popular" — subtle visual emphasis */
  popular?: boolean;
  /** If true, this tier is contact-sales only (not self-service checkout) */
  contactSales?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: PackageType.STARTER,
    name: 'Starter',
    tagline: 'Try the service, gift a few notebooks.',
    quantity: 10,
    priceCents: 4900,  // €49
    pricePerCodeCents: 490,
    features: [
      '10 branded notebook codes',
      'Custom cover editor',
      'Email support',
      'Lifetime access per notebook',
    ],
  },
  {
    id: PackageType.TEAM,
    name: 'Team',
    tagline: 'For small-to-medium teams.',
    quantity: 50,
    priceCents: 17900,  // €179
    pricePerCodeCents: 358,
    features: [
      '50 branded notebook codes',
      'Custom cover editor',
      'CSV employee upload',
      'Email automation',
      'Priority email support',
    ],
    popular: true,
  },
  {
    id: PackageType.PRO,
    name: 'Pro',
    tagline: 'Scale to mid-sized organizations.',
    quantity: 100,
    priceCents: 31900,  // €319
    pricePerCodeCents: 319,
    features: [
      '100 branded notebook codes',
      'Everything in Team',
      'Advanced cover templates',
      'Activation analytics',
      'Dedicated account contact',
    ],
  },
  {
    id: PackageType.ENTERPRISE,
    name: 'Enterprise',
    tagline: 'For large enterprises.',
    quantity: 250,
    priceCents: 69900,  // €699
    pricePerCodeCents: 280,
    features: [
      '250 branded notebook codes',
      'Everything in Pro',
      'Multiple cover versions',
      'Custom onboarding',
      'SLA 99.9% uptime',
    ],
  },
  {
    id: PackageType.SCALE,
    name: 'Scale',
    tagline: 'Custom solutions for large rollouts.',
    quantity: 0,       // custom
    priceCents: 0,      // custom
    pricePerCodeCents: 0,
    features: [
      '500+ codes, volume pricing',
      'Custom contract & DPA',
      'Pilot program support',
      'Co-branded launch',
      'Dedicated Slack channel',
    ],
    contactSales: true,
  },
];

/** Lookup by package type */
export function getTier(type: PackageType): PricingTier | undefined {
  return PRICING_TIERS.find((t) => t.id === type);
}

/** Format cents as localized EUR string */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
