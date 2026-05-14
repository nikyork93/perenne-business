'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GlassPanel, Badge, Button, Whisper } from '@/components/ui';
import { getTier, formatEuros } from '@/lib/pricing';
import type { OrderStatus, PackageType } from '@prisma/client';

interface OrderRow {
  id: string;
  companyId: string;
  companyName: string;
  packageType: PackageType;
  quantity: number;
  totalPriceCents: number;
  currency: string;
  status: OrderStatus;
  paymentReference: string | null;
  customerNote: string | null;
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
  approvedByEmail: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  codesCount: number;
  createdAt: string;
}

interface Props {
  initial: OrderRow[];
}

const FILTERS: { id: 'pending' | 'awaiting' | 'paid' | 'cancelled' | 'all'; label: string }[] = [
  { id: 'pending',   label: 'Pending' },
  { id: 'awaiting',  label: 'Awaiting payment' },
  { id: 'paid',      label: 'Paid' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all',       label: 'All' },
];

const STATUS_TONE: Record<OrderStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  PAID:              'success',
  PENDING:           'warning',
  AWAITING_PAYMENT:  'info',
  FAILED:            'danger',
  CANCELLED:         'neutral',
  REFUNDED:          'neutral',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  PAID:              'paid',
  PENDING:           'pending',
  AWAITING_PAYMENT:  'awaiting payment',
  FAILED:            'failed',
  CANCELLED:         'cancelled',
  REFUNDED:          'refunded',
};

export function OrdersAdminClient({ initial }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>(initial);
  const [filter, setFilter] = useState<typeof FILTERS[number]['id']>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'pending':   return orders.filter((o) => o.status === 'PENDING');
      case 'awaiting':  return orders.filter((o) => o.status === 'AWAITING_PAYMENT');
      case 'paid':      return orders.filter((o) => o.status === 'PAID');
      case 'cancelled': return orders.filter((o) => o.status === 'CANCELLED' || o.status === 'FAILED' || o.status === 'REFUNDED');
      default:          return orders;
    }
  }, [orders, filter]);

  const counts = useMemo(() => ({
    pending:   orders.filter((o) => o.status === 'PENDING').length,
    awaiting:  orders.filter((o) => o.status === 'AWAITING_PAYMENT').length,
    paid:      orders.filter((o) => o.status === 'PAID').length,
    cancelled: orders.filter((o) => o.status === 'CANCELLED' || o.status === 'FAILED' || o.status === 'REFUNDED').length,
    all:       orders.length,
  }), [orders]);

  async function approve(o: OrderRow) {
    if (!confirm(
      `Confirm payment received for ${o.companyName}?\n\n` +
      `${o.quantity} codes will be released to their workspace ` +
      `and invoice ${o.paymentReference ?? '—'} will be issued.`
    )) return;

    setBusy(o.id);
    setFlash(null);
    try {
      const res = await fetch(`/api/admin/orders/${o.id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: data.error ?? 'Approval failed.' });
        return;
      }
      setOrders((prev) => prev.map((row) => row.id === o.id ? {
        ...row,
        status: 'PAID',
        invoiceNumber: data.order.invoiceNumber,
        invoiceIssuedAt: new Date().toISOString(),
        paidAt: new Date().toISOString(),
        codesCount: data.codesGenerated ?? row.quantity,
      } : row));
      setFlash({
        type: 'ok',
        msg: `Approved. Invoice ${data.order.invoiceNumber} issued; ${data.codesGenerated ?? o.quantity} codes released.`,
      });
      router.refresh();
    } catch {
      setFlash({ type: 'err', msg: 'Network error.' });
    } finally {
      setBusy(null);
    }
  }

  async function reject(o: OrderRow) {
    const reason = prompt('Reason for cancelling this order (optional):') ?? '';
    if (reason === null) return;
    if (!confirm(`Cancel order ${o.paymentReference ?? o.id}? This cannot be undone.`)) return;

    setBusy(o.id);
    setFlash(null);
    try {
      const res = await fetch(`/api/admin/orders/${o.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: data.error ?? 'Cancel failed.' });
        return;
      }
      setOrders((prev) => prev.map((row) => row.id === o.id ? { ...row, status: 'CANCELLED' } : row));
      setFlash({ type: 'ok', msg: 'Order cancelled.' });
      router.refresh();
    } catch {
      setFlash({ type: 'err', msg: 'Network error.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {flash && (
        <div
          className={`mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border ${
            flash.type === 'ok'
              ? 'bg-status-success border-status-success text-status-success'
              : 'bg-status-danger border-status-danger text-status-danger'
          }`}
        >
          {flash.type === 'ok' ? '✓ ' : '✕ '}{flash.msg}
        </div>
      )}

      <div role="tablist" className="flex items-center gap-1 p-1 mb-5 rounded-2xl border border-glass-border bg-surface-faint w-fit">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium transition ${
                active ? 'bg-accent text-white shadow-sm' : 'text-ink-dim hover:text-ink hover:bg-surface-hover'
              }`}
            >
              {f.label} <span className="opacity-70">{counts[f.id]}</span>
            </button>
          );
        })}
      </div>

      <GlassPanel padding="none" className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10">
            <Whisper>No orders in this view.</Whisper>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">Created</th>
                  <th className="text-left label px-4 py-3">Company</th>
                  <th className="text-left label px-4 py-3">Package</th>
                  <th className="text-left label px-4 py-3">Amount</th>
                  <th className="text-left label px-4 py-3">Reference</th>
                  <th className="text-left label px-4 py-3">Status</th>
                  <th className="text-right label px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const tier = getTier(o.packageType);
                  const canApprove = o.status === 'PENDING' || o.status === 'AWAITING_PAYMENT';
                  return (
                    <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02] align-top">
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-dim whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{o.companyName}</div>
                        {o.customerNote && (
                          <div className="text-[10px] text-ink-faint mt-1 italic max-w-xs">"{o.customerNote}"</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-display italic">{tier?.name ?? o.packageType}</div>
                        <div className="text-[10px] text-ink-faint font-mono">{o.quantity} codes</div>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {formatEuros(o.totalPriceCents)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-dim">
                        {o.paymentReference ?? '—'}
                        {o.invoiceNumber && (
                          <div className="text-status-success">{o.invoiceNumber}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                        {o.approvedByEmail && (
                          <div className="text-[10px] text-ink-faint mt-1">by {o.approvedByEmail}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1.5">
                          {canApprove && (
                            <Button size="sm" variant="primary" onClick={() => approve(o)} loading={busy === o.id}>
                              ✓ Confirm payment
                            </Button>
                          )}
                          {(o.status === 'PENDING' || o.status === 'AWAITING_PAYMENT') && (
                            <button
                              type="button"
                              onClick={() => reject(o)}
                              disabled={busy === o.id}
                              className="text-[11px] px-2 py-1 rounded border border-status-danger hover:border-danger text-status-danger hover:text-danger transition disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          )}
                          {o.invoiceNumber && (
                            <a
                              href={`/api/orders/${o.id}/invoice?print=1`}
                              target="_blank"
                              rel="noopener"
                              className="text-[11px] px-2 py-1 rounded border border-glass-border hover:border-ink-dim text-ink-dim hover:text-ink transition"
                            >
                              Invoice ↗
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </>
  );
}
