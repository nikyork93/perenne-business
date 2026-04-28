import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireRole, createMagicLink } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/slug';
import { ownerInviteEmail } from '@/lib/email-templates';
import { env } from '@/lib/env';

interface CreateCompanyBody {
  name: string;
  slug?: string;
  legalName?: string;
  vatNumber?: string;
  taxCode?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  country?: string;
  sdiCode?: string;
  pecEmail?: string;
  primaryColor?: string;
  logoSymbolUrl?: string;
  logoExtendedUrl?: string;
  // Owner section
  ownerEmail: string;
  ownerName?: string;
  sendMagicLink?: boolean;
}

export async function POST(req: NextRequest) {
  const session = await requireRole('SUPERADMIN');

  let body: CreateCompanyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validation
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
  }
  if (!body.ownerEmail?.trim()) {
    return NextResponse.json({ error: 'Owner email is required' }, { status: 400 });
  }

  const ownerEmail = body.ownerEmail.toLowerCase().trim();

  // Generate or validate slug
  let slug = body.slug?.trim() || slugify(body.name);
  if (!slug) slug = `company-${Date.now()}`;

  // Ensure slug uniqueness — append suffix if collision
  const existing = await prisma.company.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // Create company
  const company = await prisma.company.create({
    data: {
      name: body.name.trim(),
      slug,
      legalName: body.legalName?.trim() || null,
      vatNumber: body.vatNumber?.trim() || null,
      taxCode: body.taxCode?.trim() || null,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      zipCode: body.zipCode?.trim() || null,
      country: body.country?.trim() || 'IT',
      sdiCode: body.sdiCode?.trim() || null,
      pecEmail: body.pecEmail?.trim() || null,
      primaryColor: body.primaryColor || '#1a1a1a',
      logoSymbolUrl: body.logoSymbolUrl?.trim() || null,
      logoExtendedUrl: body.logoExtendedUrl?.trim() || null,
    },
  });

  // Create or attach owner user
  let owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: body.ownerName?.trim() || null,
        role: 'OWNER',
        companyId: company.id,
        invitedByEmail: session.email,
        invitedAt: new Date(),
      },
    });
  } else if (!owner.companyId) {
    owner = await prisma.user.update({
      where: { id: owner.id },
      data: {
        companyId: company.id,
        role: owner.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'OWNER',
        invitedByEmail: session.email,
        invitedAt: new Date(),
      },
    });
  }

  // Audit log
  await prisma.auditLog
    .create({
      data: {
        companyId: company.id,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'company.created',
        targetType: 'Company',
        targetId: company.id,
      },
    })
    .catch(() => {});

  // Optional: send magic link email via Resend
  let magicLinkUrl: string | null = null;
  let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
  let emailError: string | null = null;

  if (body.sendMagicLink !== false) {
    try {
      magicLinkUrl = await createMagicLink(ownerEmail);

      if (env.RESEND_API_KEY) {
        const resend = new Resend(env.RESEND_API_KEY);
        const { subject, html, text } = ownerInviteEmail({
          companyName: company.name,
          ownerName: owner.name,
          magicLinkUrl,
          invitedBy: session.name || 'The Perenne team',
        });

        const result = await resend.emails.send({
          from: env.EMAIL_FROM || 'Perenne Business <onboarding@resend.dev>',
          to: ownerEmail,
          subject,
          html,
          text,
        });

        if (result.error) {
          emailStatus = 'failed';
          emailError = result.error.message;
          console.error('[admin/companies POST] Resend error:', result.error);
        } else {
          emailStatus = 'sent';
        }
      } else {
        emailStatus = 'failed';
        emailError = 'RESEND_API_KEY not configured';
      }
    } catch (err) {
      emailStatus = 'failed';
      emailError = err instanceof Error ? err.message : 'Unknown error';
      console.error('[admin/companies POST] Magic link error:', err);
    }
  }

  return NextResponse.json({
    company,
    owner: { id: owner.id, email: owner.email, name: owner.name, role: owner.role },
    email: { status: emailStatus, error: emailError, magicLinkUrl },
  });
}
