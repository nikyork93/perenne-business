import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { putObject } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/admin/companies/[id]/logo  — SUPERADMIN only
 *
 * Admin-side variant of /api/company/me/logo. Same multipart shape:
 *   variant: "symbol" | "extended"
 *   file:    binary image (PNG | JPEG | SVG | WebP, ≤ 5MB)
 *
 * Used by /admin/companies/[id] when the support team needs to set
 * logos on behalf of a customer.
 */

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
]);

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const VARIANT_TO_FIELD: Record<string, 'logoSymbolUrl' | 'logoExtendedUrl'> = {
  symbol: 'logoSymbolUrl',
  extended: 'logoExtendedUrl',
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { id: companyId } = await params;

  // Verify the target company exists before doing any upload work
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body.' }, { status: 400 });
  }

  const variant = String(form.get('variant') ?? '');
  const targetField = VARIANT_TO_FIELD[variant];
  if (!targetField) {
    return NextResponse.json(
      { error: 'Variant must be "symbol" or "extended".' },
      { status: 400 }
    );
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large (${Math.round(file.size / 1024)}KB).` },
      { status: 400 }
    );
  }

  const ext = mimeToExt(file.type);
  const key = `companies/${companyId}/logo-${variant}-${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);

  let url: string;
  try {
    const result = await putObject({ key, body, contentType: file.type });
    url = result.url;
  } catch (err) {
    console.error('[admin/company/logo] R2 PUT failed', err);
    return NextResponse.json(
      { error: 'Upload failed.', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { [targetField]: url },
  });

  return NextResponse.json({ ok: true, url });
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}
