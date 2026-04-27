import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { hmacSign, safeCompare } from '@/lib/crypto';

export const runtime = 'nodejs';

/**
 * Called by the Perenne API Worker when an iOS user activates a code.
 * Updates the NotebookCode row with claim metadata.
 *
 * Auth: HMAC over `timestamp:code`
 */
export async function POST(req: NextRequest) {
  if (!env.PERENNE_API_SECRET) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const signature = req.headers.get('x-perenne-signature');
  const timestamp = req.headers.get('x-perenne-timestamp');
  if (!signature || !timestamp) {
    return NextResponse.json({ error: 'Missing auth' }, { status: 401 });
  }

  const tsNum = parseInt(timestamp, 10);
  if (isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 60_000) {
    return NextResponse.json({ error: 'Invalid timestamp' }, { status: 401 });
  }

  let body: { code?: string; deviceId?: string; claimedAt?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { code, deviceId, claimedAt } = body;
  if (!code || !deviceId) {
    return NextResponse.json({ error: 'code and deviceId required' }, { status: 400 });
  }

  // Verify HMAC
  const expected = hmacSign(`${timestamp}:${code}`, env.PERENNE_API_SECRET);
  if (!safeCompare(expected, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Find code (idempotent: ignore if already claimed on same device)
  const record = await prisma.notebookCode.findUnique({
    where: { code },
    select: { id: true, companyId: true, status: true, claimedDeviceId: true },
  });
  if (!record) {
    return NextResponse.json({ error: 'Code not found' }, { status: 404 });
  }

  // Already claimed on a different device — reject
  if (record.status === 'CLAIMED' && record.claimedDeviceId && record.claimedDeviceId !== deviceId) {
    return NextResponse.json(
      { error: 'Code already claimed on a different device' },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.notebookCode.update({
      where: { id: record.id },
      data: {
        status: 'CLAIMED',
        claimedAt: claimedAt ? new Date(claimedAt) : new Date(),
        claimedDeviceId: deviceId,
      },
    }),
    prisma.auditLog.create({
      data: {
        companyId: record.companyId,
        actorEmail: 'ios-app@device',
        actorRole: 'VIEWER',
        action: 'code.claimed',
        targetType: 'NotebookCode',
        targetId: record.id,
        metadata: { deviceId: deviceId.slice(0, 8) },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
