import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/upload
 * Uploads a file to R2 via the Cloudflare Worker.
 * FormData: { file: File, kind: 'asset' | 'background' }
 * Response: { url: string }
 *
 * Path layout in R2:
 *   covers/{companyId}/assets/{timestamp}-{filename}     (kind=asset)
 *   covers/{companyId}/backgrounds/{timestamp}-{filename} (kind=background)
 */

const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];

// 10MB hard limit per file
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session.companyId) {
    return NextResponse.json({ error: 'No company.' }, { status: 400 });
  }
  if (session.role === 'VIEWER') {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  const workerUrl = process.env.ASSET_UPLOAD_WORKER_URL;
  const workerSecret = process.env.ASSET_UPLOAD_WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return NextResponse.json(
      { error: 'Asset upload not configured. Set ASSET_UPLOAD_WORKER_URL and ASSET_UPLOAD_WORKER_SECRET.' },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const kind = (formData.get('kind') as string | null) ?? 'asset';

  if (!file) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} not allowed. Use PNG, JPG, WebP, SVG, or GIF.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Max 10MB.` },
      { status: 400 }
    );
  }
  if (kind !== 'asset' && kind !== 'background' && kind !== 'watermark') {
    return NextResponse.json(
      { error: 'kind must be asset, background, or watermark.' },
      { status: 400 }
    );
  }

  // Build path
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const subfolder =
    kind === 'background' ? 'backgrounds' : kind === 'watermark' ? 'watermarks' : 'assets';
  const key = `covers/${session.companyId}/${subfolder}/${Date.now()}-${cleanName}`;

  // Forward to Worker
  const workerForm = new FormData();
  workerForm.append('file', file);
  workerForm.append('key', key);

  const workerRes = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'X-Upload-Secret': workerSecret },
    body: workerForm,
  });

  if (!workerRes.ok) {
    const text = await workerRes.text().catch(() => '');
    return NextResponse.json(
      { error: `Worker upload failed: ${workerRes.status} ${text}` },
      { status: 502 }
    );
  }

  const data = (await workerRes.json()) as { url?: string };
  if (!data.url) {
    return NextResponse.json({ error: 'Worker did not return URL.' }, { status: 502 });
  }

  // Optional: persist as CoverAsset record for tracking
  try {
    await prisma.coverAsset.create({
      data: {
        companyId: session.companyId,
        filename: cleanName,
        url: data.url,
        kind,
        sizeBytes: file.size,
        contentType: file.type,
      } as unknown as Parameters<typeof prisma.coverAsset.create>[0]['data'],
    });
  } catch {
    // Non-fatal: schema may not yet have `kind` column
  }

  return NextResponse.json({ url: data.url });
}
