import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * PATCH /api/user/me
 * Updates fields on the current authenticated user.
 *
 * Allowed body fields:
 *   - themePreference: "dark" | "light"
 *
 * (Add more fields here over time — keep allowlist explicit.)
 */
export async function PATCH(req: Request) {
  const session = await requireSession();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  // themePreference
  if ('themePreference' in body) {
    const v = body.themePreference;
    if (v !== 'dark' && v !== 'light') {
      return NextResponse.json(
        { error: 'themePreference must be "dark" or "light".' },
        { status: 400 }
      );
    }
    data.themePreference = v;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: data as unknown as Parameters<typeof prisma.user.update>[0]['data'],
  });

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/user/me — return minimal user info (used by client to hydrate prefs)
 */
export async function GET() {
  const session = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  // Read themePreference defensively in case the client wasn't regenerated yet
  const fullUser = (await prisma.user.findUnique({
    where: { id: session.userId },
  })) as unknown as { themePreference?: string | null };

  return NextResponse.json({
    user: {
      ...user,
      themePreference: fullUser?.themePreference ?? 'dark',
    },
  });
}
