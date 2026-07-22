import { NextResponse } from 'next/server';
import { clearedSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/auth/logout -> clears the session cookie.
export async function POST() {
  const cookie = clearedSessionCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
