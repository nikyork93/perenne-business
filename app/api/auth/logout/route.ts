import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { destroySession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  await destroySession();
  return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/`);
}

// Also accept POST for HTML form submissions
export async function POST() {
  return GET();
}
