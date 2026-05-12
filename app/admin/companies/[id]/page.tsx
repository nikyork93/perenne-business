import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { GlassPanel, Badge } from '@/components/ui';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect, notFound } from 'next/navigation';
import { CompanyLogoUploaders } from '@/components/admin/CompanyLogoUploaders';

export const dynamic = 'force-dynamic';

/**
 * /admin/companies/[id] — SUPERADMIN view of a single company.
 *
 * v47 changes:
 *   - Logo URL inputs replaced with proper file uploaders (the
 *     customer can also self-serve via /settings/company; this page
 *     is our backup when they don't).
 *   - Layout reorganized into clear sections (Info / Brand / Stats).
 *
 * The actual mutation endpoint reuses /api/admin/companies/[id]/logo
 * which proxies the same R2 upload as /api/company/me/logo but
 * scoped by URL param instead of session.
 */
export default async function AdminCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  if (session.role !== 'SUPERADMIN') {
    redirect('/dashboard');
  }

  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      legalName: true,
      vatNumber: true,
      taxCode: true,
      address: true,
      city: true,
      zipCode: true,
      country: true,
      sdiCode: true,
      pecEmail: true,
      logoSymbolUrl: true,
      logoExtendedUrl: true,
      primaryColor: true,
      createdAt: true,
      _count: {
        select: {
          members: true,
          notebookCodes: true,
          designs: true,
        },
      },
    },
  });

  if (!company) notFound();

  return (
    <Shell userEmail={session.email} isSuperAdmin>
      <div className="max-w-5xl mx-auto p-8 space-y-6">
        <div>
          <Link
            href="/admin/companies"
            className="text-xs text-ink-faint hover:text-ink-dim mb-3 inline-block"
          >
            ← All companies
          </Link>
          <PageHeader
            eyebrow="Superadmin · Company"
            title={company.name}
            description={`Slug: ${company.slug} · Created ${new Date(company.createdAt).toLocaleDateString()}`}
          />
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <GlassPanel className="p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono">
              Members
            </div>
            <div className="text-2xl font-medium text-ink mt-1">
              {company._count.members}
            </div>
          </GlassPanel>
          <GlassPanel className="p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono">
              Codes
            </div>
            <div className="text-2xl font-medium text-ink mt-1">
              {company._count.notebookCodes}
            </div>
          </GlassPanel>
          <GlassPanel className="p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono">
              Designs
            </div>
            <div className="text-2xl font-medium text-ink mt-1">
              {company._count.designs}
            </div>
          </GlassPanel>
        </div>

        {/* Brand assets — upload, no URL inputs */}
        <GlassPanel className="p-6 space-y-4">
          <header>
            <h2 className="text-base font-medium text-ink">Brand assets</h2>
            <p className="text-xs text-ink-dim mt-1">
              The customer can also self-serve these from{' '}
              <code className="text-[11px]">/settings/company</code>. Upload
              here when you need to set them on their behalf.
            </p>
          </header>
          <CompanyLogoUploaders
            companyId={company.id}
            initialSymbolUrl={company.logoSymbolUrl}
            initialExtendedUrl={company.logoExtendedUrl}
          />
          {company.primaryColor && (
            <div className="flex items-center gap-3 pt-2 border-t border-border-subtle">
              <div className="text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono">
                Primary color
              </div>
              <div
                className="w-6 h-6 rounded border border-glass-border"
                style={{ background: company.primaryColor }}
              />
              <code className="text-xs text-ink-dim">{company.primaryColor}</code>
            </div>
          )}
        </GlassPanel>

        {/* Company info — read-only here, the customer edits these from their side */}
        <GlassPanel className="p-6">
          <header className="mb-4">
            <h2 className="text-base font-medium text-ink">Company info</h2>
            <p className="text-xs text-ink-dim mt-1">
              Read-only. The customer manages these fields from{' '}
              <code className="text-[11px]">/settings/company</code>.
            </p>
          </header>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Info label="Display name" value={company.name} />
            <Info label="Legal name" value={company.legalName} />
            <Info label="VAT" value={company.vatNumber} />
            <Info label="Tax code" value={company.taxCode} />
            <Info label="Address" value={company.address} />
            <Info label="City" value={company.city} />
            <Info label="ZIP" value={company.zipCode} />
            <Info label="Country" value={company.country} />
            <Info label="SDI code" value={company.sdiCode} />
            <Info label="PEC" value={company.pecEmail} />
          </dl>
        </GlassPanel>
      </div>
    </Shell>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.2em] text-ink-faint font-mono">
        {label}
      </dt>
      <dd className="text-ink-dim mt-1">
        {value ?? <span className="italic text-ink-faint">—</span>}
      </dd>
    </div>
  );
}
