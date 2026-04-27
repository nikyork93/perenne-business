import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { hmacSign } from '@/lib/crypto';

export const runtime = 'nodejs';

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['OWNER', 'ADMIN', 'SUPERADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // Ensure secret is configured
  if (!env.PERENNE_API_SECRET) {
    return NextResponse.json(
      { error: 'Server not configured for asset upload.' },
      { status: 500 }
    );
  }

  // Read incoming multipart body
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File required' }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. PNG, JPEG, WebP, or SVG only.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 });
  }

  const companyId = session.companyId;

  // Create DB record first so we have an assetId to use as R2 key
  const asset = await prisma.coverAsset.create({
    data: {
      companyId,
      name: file.name || 'asset',
      r2Key: '',   // filled after upload succeeds
      r2Url: '',
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });

  // Forward to worker with HMAC auth
  const timestamp = String(Date.now());
  const signature = hmacSign(`${timestamp}:${companyId}`, env.PERENNE_API_SECRET);

  const forwardForm = new FormData();
  forwardForm.append('companyId', companyId);
  forwardForm.append('assetId', asset.id);
  forwardForm.append('file', file);

  let workerRes: Response;
  try {
    workerRes = await fetch(`${env.PERENNE_API_URL}/assets/upload`, {
      method: 'POST',
      headers: {
        'x-perenne-signature': signature,
        'x-perenne-timestamp': timestamp,
      },
      body: forwardForm,
    });
  } catch (e) {
    // Rollback DB record
    await prisma.coverAsset.delete({ where: { id: asset.id } }).catch(() => null);
    return NextResponse.json({ error: 'Upload service unreachable' }, { status: 502 });
  }

  if (!workerRes.ok) {
    await prisma.coverAsset.delete({ where: { id: asset.id } }).catch(() => null);
    const data = await workerRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error ?? 'Upload failed' },
      { status: workerRes.status }
    );
  }

  const result = await workerRes.json();

  // Persist R2 URL
  const updated = await prisma.coverAsset.update({
    where: { id: asset.id },
    data: {
      r2Key: result.r2Key,
      r2Url: result.url,
    },
  });

  return NextResponse.json({
    ok: true,
    asset: {
      id: updated.id,
      name: updated.name,
      url: updated.r2Url,
      mimeType: updated.mimeType,
      sizeBytes: updated.sizeBytes,
    },
  });
}
