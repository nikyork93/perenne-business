import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { putObject } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Logo uploads run server-side through R2; bump duration to handle
// slower upstream connections (no streaming on Vercel functions).
export const maxDuration = 30;

/**
 * POST /api/company/me/logo
 *
 * Multipart form upload for the company's brand logos. The form must
 * include:
 *   variant: "symbol" | "extended"
 *   file:    binary image (image/png | image/jpeg | image/svg+xml | image/webp)
 *
 * The file is uploaded to R2 under a deterministic key:
 *   companies/{companyId}/logo-{variant}-{timestamp}.{ext}
 *
 * The timestamp suffix busts CDN caches — uploading a new logo gets a
 * new URL, so existing pages don't keep showing the old one. The old
 * R2 object is left in place (no GC). For our scale that's fine.
 *
 * On success we update Company.logoSymbolUrl or logoExtendedUrl with
 * the public URL and return the updated company.
 *
 * Permissions: OWNER / ADMIN of the company, or SUPERADMIN.
 */

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
]);

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — symbol logos are tiny

const VARIANT_TO_FIELD: Record<string, 'logoSymbolUrl' | 'logoExtendedUrl'> = {
  symbol: 'logoSymbolUrl',
  extended: 'logoExtendedUrl',
};

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 404 });
  }
  const allowed =
    session.role === 'OWNER' ||
    session.role === 'ADMIN' ||
    session.role === 'SUPERADMIN';
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Invalid multipart body.' },
      { status: 400 }
    );
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
      { error: `Unsupported file type: ${file.type}. Use PNG, JPEG, SVG or WebP.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large (${Math.round(file.size / 1024)}KB > ${MAX_SIZE_BYTES / 1024}KB).` },
      { status: 400 }
    );
  }

  const ext = mimeToExt(file.type);
  const key = `companies/${session.companyId}/logo-${variant}-${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);

  let url: string;
  try {
    const result = await putObject({
      key,
      body,
      contentType: file.type,
    });
    url = result.url;
  } catch (err) {
    console.error('[company/me/logo] R2 PUT failed', err);
    return NextResponse.json(
      { error: 'Upload failed.', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const updated = await prisma.company.update({
    where: { id: session.companyId },
    data: { [targetField]: url },
    select: {
      id: true,
      logoSymbolUrl: true,
      logoExtendedUrl: true,
    },
  });

  return NextResponse.json({ ok: true, url, company: updated });
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
