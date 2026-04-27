import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Button, Whisper, Badge } from '@/components/ui';
import { getTier, formatEuros } from '@/lib/pricing';

interface Props {
  searchParams: Promise<{ order_id?: string }>;
}

export default async function StoreSuccessPage({ searchParams }: Props) {
  const session = await requireSession();
  if (!session.companyId) {
    const { redirect } = await import('next/navigation');
    redirect('/onboarding');
  }

  const params = await searchParams;
  const orderId = params.order_id;

  const order = orderId
    ? await prisma.order.findUnique({
        where: { id: orderId },
        include: { notebookCodes: { select: { id: true } } },
      })
    : null;

  // Ensure the order belongs to this company
  const isOrderOwned = order?.companyId === session.companyId;

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
  });

  const tier = order ? getTier(order.packageType) : null;
  const isPaid = order?.status === 'PAID';
  const isPending = order?.status === 'PENDING';

  return (
    <Shell
      companyName={company?.name}
      userEmail={session.email}
      isSuperAdmin={session.role === 'SUPERADMIN'}
    >
      <div className="max-w-2xl">
        <PageHeader
          eyebrow={isPaid ? 'Order confirmed' : 'Order pending'}
          title={isPaid ? 'Thank you' : 'Processing…'}
        />

        {!order || !isOrderOwned ? (
          <GlassPanel padding="lg">
            <Whisper>Order not found or not accessible.</Whisper>
          </GlassPanel>
        ) : (
          <GlassPanel padding="lg" className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="label mb-2">Order</div>
                <div className="font-mono text-xs text-ink-dim">{order.id}</div>
              </div>
              <Badge tone={isPaid ? 'success' : isPending ? 'warning' : 'danger'}>
                {order.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-glass-border">
              <div>
                <div className="label mb-1.5">Package</div>
                <div className="font-display italic text-xl">{tier?.name ?? order.packageType}</div>
              </div>
              <div>
                <div className="label mb-1.5">Codes</div>
                <div className="font-display italic text-xl">{order.quantity}</div>
              </div>
              <div>
                <div className="label mb-1.5">Total</div>
                <div className="font-display italic text-xl">
                  {formatEuros(order.totalPriceCents)}
                </div>
              </div>
              <div>
                <div className="label mb-1.5">Codes generated</div>
                <div className="font-display italic text-xl">
                  {order.notebookCodes.length}
                </div>
              </div>
            </div>

            {isPending && (
              <div className="pt-4 border-t border-glass-border">
                <Whisper>
                  Payment is processing. This page will refresh automatically
                  once Stripe confirms the transaction (usually within a few seconds).
                </Whisper>
              </div>
            )}

            {isPaid && (
              <div className="pt-4 border-t border-glass-border flex gap-3">
                <Link href="/codes">
                  <Button variant="primary">View codes →</Button>
                </Link>
                <Link href="/distribution">
                  <Button>Distribute to team</Button>
                </Link>
                {order.stripeInvoiceUrl && (
                  <a href={order.stripeInvoiceUrl} target="_blank" rel="noopener">
                    <Button variant="ghost">Invoice ↗</Button>
                  </a>
                )}
              </div>
            )}
          </GlassPanel>
        )}
      </div>

      {/* Auto-refresh if still pending (webhook may be late) */}
      {isPending && (
        <meta httpEquiv="refresh" content="5" />
      )}
    </Shell>
  );
}
