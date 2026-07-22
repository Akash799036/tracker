import { NextResponse } from 'next/server';
import {
  authConfigured,
  sessionCookieFor,
  verifyCredentials,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/auth/login  { username, password } -> 200 { user } + session cookie
//
// A generic "invalid credentials" message on any failure so we don't reveal
// whether the username or the password was the wrong one.
export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: 'Login is not configured on the server. Set AUTH_SECRET, AUTH_USERNAME and AUTH_PASSWORD.' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({} as any));
  const username = String(body?.username ?? '');
  const password = String(body?.password ?? '');

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }

  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  const cookie = sessionCookieFor({ username: username.trim() });
  if (!cookie) {
    return NextResponse.json({ error: 'Login is not configured on the server.' }, { status: 503 });
  }

  const res = NextResponse.json({ user: { username: username.trim() } });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
