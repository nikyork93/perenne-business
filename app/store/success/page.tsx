import Link from 'next/link';
import { redirect } from 'next/navigation';
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
    redirect('/onboarding');
  }

  const companyId = session.companyId;
  const params = await searchParams;
  const orderId = params.order_id;

  const [company, order] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    orderId
      ? prisma.order.findUnique({
          where: { id: orderId },
          include: { notebookCodes: { select: { id: true } } },
        })
      : Promise.resolve(null),
  ]);

  const isOrderOwned = order?.companyId === companyId;
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
                <div className="font-display italic text-xl">{formatEuros(order.totalPriceCents)}</div>
              </div>
              <div>
                <div className="label mb-1.5">Codes generated</div>
                <div className="font-display italic text-xl">{order.notebookCodes.length}</div>
              </div>
            </div>

            {isPending && (
              <div className="pt-4 border-t border-glass-border">
                <Whisper>Payment is processing. This page refreshes automatically.</Whisper>
              </div>
            )}

            {isPaid && (
              <div className="pt-4 border-t border-glass-border flex gap-3">
                <Link href="/codes"><Button variant="primary">View codes →</Button></Link>
                <Link href="/distribution"><Button>Distribute to team</Button></Link>
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

      {isPending && <meta httpEquiv="refresh" content="5" />}
    </Shell>
  );
}
