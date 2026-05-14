'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackageType } from '@prisma/client';
import { GlassPanel, Button, Badge } from '@/components/ui';
import { PRICING_TIERS, formatEuros, type PricingTier } from '@/lib/pricing';
import { cn } from '@/lib/cn';

interface BankDetails {
  beneficiary: string;
  beneficiaryAddress: string;
  beneficiaryVat: string;
  bank: string;
  iban: string;
  bic: string;
  notice: string;
}

interface OrderConfirmation {
  id: string;
  packageType: PackageType;
  quantity: number;
  totalPriceCents: number;
  paymentReference: string;
}

export function StoreGrid() {
  const router = useRouter();
  const [activeTier, setActiveTier] = useState<PricingTier | null>(null);
  const [loadingTier, setLoadingTier] = useState<PackageType | null>(null);
  const [submitted, setSubmitted] = useState<{ order: OrderConfirmation; bank: BankDetails } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openTier(tier: PricingTier) {
    if (tier.contactSales) {
      window.location.href = 'mailto:business@perenne.app?subject=Scale%20pack%20inquiry';
      return;
    }
    setError(null);
    setSubmitted(null);
    setActiveTier(tier);
  }

  async function placeOrder(customerNote: string) {
    if (!activeTier) return;
    setLoadingTier(activeTier.id);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageType: activeTier.id,
          customerNote: customerNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not place order.');
        setLoadingTier(null);
        return;
      }
      setSubmitted({ order: data.order, bank: data.bank });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoadingTier(null);
    }
  }

  async function markAsSent() {
    if (!submitted) return;
    try {
      await fetch(`/api/orders/${submitted.order.id}/mark-sent`, { method: 'POST' });
    } catch {
      // We don't gate the popup close on this — the wire is what the
      // super-admin actually checks, so it's fine if the status hint
      // fails to update.
    } finally {
      setSubmitted(null);
      setActiveTier(null);
      router.push('/billing');
    }
  }

  return (
    <>
      {error && (
        <div className="mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border bg-status-danger border-status-danger text-status-danger">
          ✕ {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {PRICING_TIERS.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            loading={loadingTier === tier.id}
            onSelect={() => openTier(tier)}
          />
        ))}
      </div>

      {activeTier && !submitted && (
        <PlaceOrderDialog
          tier={activeTier}
          loading={loadingTier === activeTier.id}
          onCancel={() => setActiveTier(null)}
          onConfirm={(note) => placeOrder(note)}
        />
      )}

      {submitted && (
        <PaymentInstructionsDialog
          order={submitted.order}
          bank={submitted.bank}
          tier={PRICING_TIERS.find((t) => t.id === submitted.order.packageType) ?? null}
          onMarkSent={markAsSent}
          onClose={() => { setSubmitted(null); setActiveTier(null); }}
        />
      )}
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
        {tier.contactSales ? 'Contact sales' : 'Request pack'}
      </Button>
    </GlassPanel>
  );
}

/* ─── Modals ─────────────────────────────────────────────────────── */

function ModalShell({
  children,
  onClose,
  maxWidth = 'max-w-lg',
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`${maxWidth} w-full rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto`}
        style={{
          background: 'var(--glass-bg-hi)',
          border: '1px solid var(--glass-border)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PlaceOrderDialog({
  tier, loading, onCancel, onConfirm,
}: {
  tier: PricingTier;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (customerNote: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <ModalShell onClose={onCancel}>
      <div className="mb-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-1">
          Confirm request
        </div>
        <h2 className="text-lg font-medium text-ink">
          {tier.name} pack — {tier.quantity} codes
        </h2>
        <p className="mt-1 text-xs text-ink-dim">
          You'll receive bank transfer instructions on the next step.
          Codes are released after we receive your wire (usually within
          one business day).
        </p>
      </div>

      <div className="rounded-xl border border-glass-border bg-surface-faint p-4 mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-ink-dim">Total</span>
          <span className="font-display italic text-2xl">{formatEuros(tier.priceCents)}</span>
        </div>
        <div className="flex items-baseline justify-between text-[11px] text-ink-faint font-mono">
          <span>{tier.quantity} codes</span>
          <span>{formatEuros(tier.pricePerCodeCents)} each</span>
        </div>
      </div>

      <label className="block mb-1.5 text-[11px] text-ink-dim font-medium">
        Note for Perenne (optional)
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Anything we should know about this order…"
        disabled={loading}
        className="w-full px-4 py-2.5 rounded-xl bg-surface-faint border border-glass-border text-ink text-sm focus:outline-none focus:border-accent/50 transition mb-4"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 rounded-xl border border-glass-border text-ink-dim hover:text-ink hover:border-ink-dim transition text-[12px]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(note)}
          disabled={loading}
          className="flex-1 px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent-bright transition text-[12px] font-medium disabled:opacity-50"
        >
          {loading ? 'Creating order…' : 'Get payment instructions →'}
        </button>
      </div>
    </ModalShell>
  );
}

function PaymentInstructionsDialog({
  order, bank, tier, onMarkSent, onClose,
}: {
  order: OrderConfirmation;
  bank: BankDetails;
  tier: PricingTier | null;
  onMarkSent: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  function copy(value: string) {
    navigator.clipboard.writeText(value).catch(() => null);
  }

  async function handleMark() {
    setConfirming(true);
    await onMarkSent();
    // No setConfirming(false) — onMarkSent navigates away.
  }

  const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-glass-border last:border-b-0">
      <span className="text-[11px] text-ink-faint font-mono uppercase tracking-widest pt-0.5">{label}</span>
      <button
        type="button"
        onClick={() => copy(value)}
        title="Click to copy"
        className={`text-right flex-1 hover:text-accent transition-colors text-ink ${mono ? 'font-mono text-[12px]' : 'text-[13px]'}`}
      >
        {value}
      </button>
    </div>
  );

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-xl">
      <div className="mb-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-1">
          Order placed
        </div>
        <h2 className="text-lg font-medium text-ink">
          Send wire to release your codes
        </h2>
        <p className="mt-1 text-xs text-ink-dim">
          Your {tier?.name ?? order.packageType} pack of {order.quantity} codes is reserved.
          Send the bank wire using the details below, then click "I sent the wire" so we can
          start watching for it.
        </p>
      </div>

      {/* Order summary */}
      <div className="rounded-xl border border-glass-border bg-surface-faint p-4 mb-4">
        <Row label="Reference" value={order.paymentReference} mono />
        <Row label="Amount" value={formatEuros(order.totalPriceCents)} />
        <Row label="Quantity" value={`${order.quantity} codes`} />
      </div>

      {/* Bank details */}
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-ink-faint mb-2 px-1">
        Bank transfer details · click to copy
      </h3>
      <div className="rounded-xl border border-glass-border bg-surface-faint p-4 mb-4">
        <Row label="Beneficiary" value={bank.beneficiary} />
        <Row label="Address"     value={bank.beneficiaryAddress} />
        <Row label="VAT"         value={bank.beneficiaryVat} mono />
        <Row label="Bank"        value={bank.bank} />
        <Row label="IBAN"        value={bank.iban} mono />
        <Row label="BIC / SWIFT" value={bank.bic} mono />
      </div>

      <div className="rounded-xl border border-status-warning bg-status-warning text-status-warning p-3 text-[11px] leading-relaxed mb-5">
        <strong>Important:</strong> use the payment reference{' '}
        <span className="font-mono">{order.paymentReference}</span> exactly as written
        in the wire's description. {bank.notice}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={confirming}
          className="px-4 py-2 rounded-xl border border-glass-border text-ink-dim hover:text-ink hover:border-ink-dim transition text-[12px]"
        >
          I'll send later
        </button>
        <button
          type="button"
          onClick={handleMark}
          disabled={confirming}
          className="flex-1 px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent-bright transition text-[12px] font-medium disabled:opacity-50"
        >
          {confirming ? 'Submitting…' : 'I sent the wire ✓'}
        </button>
      </div>
    </ModalShell>
  );
}
