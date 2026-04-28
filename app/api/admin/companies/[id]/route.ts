import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/slug';

interface UpdateBody {
  name?: string;
  slug?: string;
  legalName?: string | null;
  vatNumber?: string | null;
  taxCode?: string | null;
  address?: string | null;
  city?: string | null;
  zipCode?: string | null;
  country?: string | null;
  sdiCode?: string | null;
  pecEmail?: string | null;
  primaryColor?: string | null;
  logoSymbolUrl?: string | null;
  logoExtendedUrl?: string | null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireRole('SUPERADMIN');
  const { id } = await ctx.params;

  let body: UpdateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const fields: (keyof UpdateBody)[] = [
    'name',
    'legalName',
    'vatNumber',
    'taxCode',
    'address',
    'city',
    'zipCode',
    'country',
    'sdiCode',
    'pecEmail',
    'primaryColor',
    'logoSymbolUrl',
    'logoExtendedUrl',
  ];

  for (const key of fields) {
    if (body[key] !== undefined) {
      const v = body[key];
      data[key] = typeof v === 'string' ? v.trim() || null : v;
    }
  }

  // Slug update: validate uniqueness
  if (body.slug !== undefined) {
    const newSlug = body.slug.trim() || slugify(body.name || '');
    if (newSlug) {
      const conflict = await prisma.company.findFirst({
        where: { slug: newSlug, NOT: { id } },
      });
      if (conflict) {
        return NextResponse.json(
          { error: 'Slug already in use by another company' },
          { status: 409 }
        );
      }
      data.slug = newSlug;
    }
  }

  const company = await prisma.company.update({ where: { id }, data });

  await prisma.auditLog
    .create({
      data: {
        companyId: id,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'company.updated',
        targetType: 'Company',
        targetId: id,
      },
    })
    .catch(() => {});

  return NextResponse.json({ company });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireRole('SUPERADMIN');
  const { id } = await ctx.params;

  // onDelete: Cascade in schema → users, codes, orders, etc. cleaned up
  await prisma.company.delete({ where: { id } });

  await prisma.auditLog
    .create({
      data: {
        companyId: null,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'company.deleted',
        targetType: 'Company',
        targetId: id,
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
