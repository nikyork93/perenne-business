import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { putObject } from '@/lib/r2';

export const runtime = 'nodejs';

/**
 * POST /api/upload
 *
 * Upload a file to R2 directly (no Cloudflare Worker proxy).
 *
 * FormData: { file: File, kind: 'asset' | 'background' | 'watermark' }
 * Response: { url: string }
 *
 * Path layout in R2:
 *   covers/{companyId}/assets/{timestamp}-{filename}      (kind=asset)
 *   covers/{companyId}/backgrounds/{timestamp}-{filename} (kind=background)
 *   covers/{companyId}/watermarks/{timestamp}-{filename}  (kind=watermark)
 *
 * Migration note: previously this proxied via Worker /assets/upload
 * with X-Upload-Secret. The Worker is being dismissed; we now use
 * @aws-sdk/client-s3 against R2's S3-compatible API. See lib/r2.ts
 * for the env var setup.
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

  // Build R2 key
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const subfolder =
    kind === 'background' ? 'backgrounds' : kind === 'watermark' ? 'watermarks' : 'assets';
  const key = `covers/${session.companyId}/${subfolder}/${Date.now()}-${cleanName}`;

  // Buffer the file (Next.js File is a Web ReadableStream; AWS SDK
  // wants Buffer / Uint8Array). For our 10MB max this is fine in RAM.
  let body: Buffer;
  try {
    const arr = await file.arrayBuffer();
    body = Buffer.from(arr);
  } catch (err) {
    console.error('[upload] arrayBuffer failed', err);
    return NextResponse.json({ error: 'Failed to read file.' }, { status: 400 });
  }

  // Upload directly to R2
  let result: { url: string };
  try {
    result = await putObject({
      key,
      body,
      contentType: file.type,
    });
  } catch (err) {
    console.error('[upload] R2 putObject failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'R2 upload failed.' },
      { status: 502 }
    );
  }

  // Optional: persist as CoverAsset record for tracking. Wrapped in
  // try/catch since the schema may not yet have all expected columns
  // in older deploys — the upload succeeds either way.
  try {
    await prisma.coverAsset.create({
      data: {
        companyId: session.companyId,
        filename: cleanName,
        url: result.url,
        kind,
        sizeBytes: file.size,
        contentType: file.type,
      } as unknown as Parameters<typeof prisma.coverAsset.create>[0]['data'],
    });
  } catch {
    // Non-fatal: schema may not have these columns
  }

  return NextResponse.json({ url: result.url });
}
