import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { OrdersAdminClient } from './OrdersAdminClient';

export const metadata = {
  title: 'Orders',
};

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage() {
  const session = await requireRole('SUPERADMIN');

  const initialOrders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { id: true, name: true, slug: true } },
      _count: { select: { notebookCodes: true } },
    },
    take: 500,
  });

  return (
    <Shell userEmail={session.email} isSuperAdmin={true}>
      <PageHeader
        eyebrow="Superadmin · Orders"
        title="Manual order review"
        description="Approve incoming wires to release notebook codes. Cancel orders that didn't complete."
      />
      <OrdersAdminClient
        initial={initialOrders.map((o) => ({
          id: o.id,
          companyId: o.company.id,
          companyName: o.company.name,
          packageType: o.packageType,
          quantity: o.quantity,
          totalPriceCents: o.totalPriceCents,
          currency: o.currency,
          status: o.status,
          paymentReference: o.paymentReference,
          customerNote: o.customerNote,
          invoiceNumber: o.invoiceNumber,
          invoiceIssuedAt: o.invoiceIssuedAt ? o.invoiceIssuedAt.toISOString() : null,
          approvedByEmail: o.approvedByEmail,
          approvedAt: o.approvedAt ? o.approvedAt.toISOString() : null,
          paidAt: o.paidAt ? o.paidAt.toISOString() : null,
          codesCount: o._count.notebookCodes,
          createdAt: o.createdAt.toISOString(),
        }))}
      />
    </Shell>
  );
}
