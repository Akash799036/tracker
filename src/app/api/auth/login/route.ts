import { NextResponse } from 'next/server';
import {
  authConfigured,
  sessionCookieFor,
  verifyLogin,
} from '@/lib/auth';
import { decryptLoginBlob } from '@/lib/loginCrypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/auth/login -> 200 { user } + session cookie
//
// Accepts either:
//   { enc: "<base64 RSA-OAEP ciphertext of JSON {username,password}>" }  (preferred)
//   { username, password }                                              (legacy plaintext)
// The `enc` form keeps the credentials out of the network Payload tab (see
// src/lib/loginCrypto.ts — cosmetic, TLS is the real transport security). The
// plaintext form stays supported so older clients / tooling keep working.
//
// A generic "invalid credentials" message on any failure so we don't reveal
// whether the username or the password was the wrong one.
export async function POST(req: Request) {
  if (!(await authConfigured())) {
    return NextResponse.json(
      { error: 'Login is not configured on the server. Set AUTH_SECRET and seed users (npm run seed:users).' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({} as any));

  let username = '';
  let password = '';
  if (typeof body?.enc === 'string' && body.enc) {
    // Encrypted payload: decrypt then parse the inner {username,password}.
    const decrypted = decryptLoginBlob(body.enc);
    if (decrypted === null) {
      // Could be a stale key after a server restart — ask the client to retry.
      return NextResponse.json(
        { error: 'Could not read the encrypted credentials. Please try again.' },
        { status: 400 }
      );
    }
    try {
      const inner = JSON.parse(decrypted);
      username = String(inner?.username ?? '');
      password = String(inner?.password ?? '');
    } catch {
      return NextResponse.json({ error: 'Malformed credentials.' }, { status: 400 });
    }
  } else {
    username = String(body?.username ?? '');
    password = String(body?.password ?? '');
  }

  if (!username || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  // `username` carries the login identity — an email on the Dashboard allow-list,
  // or the legacy admin username. verifyLogin resolves it to a full SessionUser
  // (with email + selected flag) or null.
  const user = await verifyLogin(username, password);
  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const cookie = sessionCookieFor(user);
  if (!cookie) {
    return NextResponse.json({ error: 'Login is not configured on the server.' }, { status: 503 });
  }

  const res = NextResponse.json({ user });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
