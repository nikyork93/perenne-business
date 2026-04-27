import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { uniqueSlug } from '@/lib/slug';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name:      z.string().trim().min(2).max(100),
  country:   z.string().length(2).toUpperCase(),
  legalName: z.string().trim().max(200).optional().or(z.literal('')),
  vatNumber: z.string().trim().max(50).optional().or(z.literal('')),
  address:   z.string().trim().max(200).optional().or(z.literal('')),
  city:      z.string().trim().max(100).optional().or(z.literal('')),
  zipCode:   z.string().trim().max(20).optional().or(z.literal('')),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // User already has a company: use PATCH /api/company/[id] instead
  if (session.companyId) {
    return NextResponse.json(
      { error: 'You are already associated with a company.' },
      { status: 400 }
    );
  }

  let data: z.infer<typeof bodySchema>;
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    data = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Generate unique slug
  const slug = await uniqueSlug(data.name, async (s) =>
    !!(await prisma.company.findUnique({ where: { slug: s } }))
  );

  // Create company + associate current user as OWNER
  const company = await prisma.$transaction(async (tx) => {
    const c = await tx.company.create({
      data: {
        slug,
        name:      data.name,
        legalName: data.legalName || null,
        vatNumber: data.vatNumber || null,
        address:   data.address || null,
        city:      data.city || null,
        zipCode:   data.zipCode || null,
        country:   data.country,
      },
    });

    // Attach user to company as OWNER
    await tx.user.update({
      where: { id: session.userId },
      data: { companyId: c.id, role: 'OWNER' },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        companyId: c.id,
        actorEmail: session.email,
        actorRole: 'OWNER',
        action: 'company.created',
        targetType: 'Company',
        targetId: c.id,
        metadata: { name: c.name, country: c.country },
      },
    });

    return c;
  });

  return NextResponse.json({ ok: true, company });
}
