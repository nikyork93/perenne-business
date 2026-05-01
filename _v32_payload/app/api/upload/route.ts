import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { putObject } from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];

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
      { error: `File type ${file.type} not allowed.` },
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
    return NextResponse.json({ error: 'Invalid kind.' }, { status: 400 });
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const subfolder =
    kind === 'background' ? 'backgrounds' : kind === 'watermark' ? 'watermarks' : 'assets';
  const key = `covers/${session.companyId}/${subfolder}/${Date.now()}-${cleanName}`;

  let body: Buffer;
  try {
    const arr = await file.arrayBuffer();
    body = Buffer.from(arr);
  } catch (err) {
    console.error('[upload] arrayBuffer failed', err);
    return NextResponse.json({ error: 'Failed to read file.' }, { status: 400 });
  }

  let result: { url: string; key: string };
  try {
    result = await putObject({ key, body, contentType: file.type });
  } catch (err) {
    console.error('[upload] R2 putObject failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'R2 upload failed.' },
      { status: 502 }
    );
  }

  // Best-effort persist as CoverAsset (non-fatal)
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
    /* schema may differ; not fatal */
  }

  return NextResponse.json({ url: result.url });
}
