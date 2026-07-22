import 'server-only';
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { cookies } from 'next/headers';

// Server-only authentication for the tracker.
//
// The app is an internal team tool, so authentication is deliberately small:
// one shared admin account whose credentials live in the environment, and a
// stateless, signed session cookie. No auth library, no session table — the
// cookie itself is the session, and its HMAC signature is what makes it
// unforgeable.
//
//   AUTH_USERNAME   — the login name (default 'admin')
//   AUTH_PASSWORD   — the login password (plain; compared in constant time)
//   AUTH_SECRET     — HMAC key for signing the session cookie. REQUIRED in
//                     production; a missing secret disables login rather than
//                     silently signing with a guessable key.
//
// The security boundary is the API: every data-mutating request calls
// requireAuth(), so hiding the edit UI on the client is only cosmetic.

export const SESSION_COOKIE = 'pt_session';

// Cookie lifetime. A team tool doesn't need aggressive expiry; a week means a
// login survives a normal work rhythm without a daily re-auth.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionUser = { username: string };

function authSecret(): string | null {
  const s = process.env.AUTH_SECRET;
  // Treat empty/whitespace as unset so a blank line in .env doesn't sign
  // sessions with the empty string.
  return s && s.trim() ? s : null;
}

function configuredUser(): { username: string; password: string } | null {
  const username = (process.env.AUTH_USERNAME || 'admin').trim();
  const password = process.env.AUTH_PASSWORD || '';
  if (!password) return null; // no password configured → login is disabled
  return { username, password };
}

/** True when the server is configured well enough for anyone to log in. */
export function authConfigured(): boolean {
  return authSecret() !== null && configuredUser() !== null;
}

// Constant-time string comparison that also resists length leakage by hashing
// both sides to a fixed width first.
function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Verify a username/password against the configured admin credentials. */
export function verifyCredentials(username: string, password: string): boolean {
  const cfg = configuredUser();
  if (!cfg) return false;
  // Evaluate both comparisons regardless, so timing doesn't reveal whether it
  // was the username or the password that was wrong.
  const okUser = safeEqual(username.trim(), cfg.username);
  const okPass = safeEqual(password, cfg.password);
  return okUser && okPass;
}

// ---- Session token: base64url(payload) + '.' + hmac(payload) ----------------

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

function makeToken(user: SessionUser, secret: string): string {
  const body = { u: user.username, exp: Date.now() + SESSION_TTL_MS, n: randomBytes(6).toString('hex') };
  const payload = b64url(Buffer.from(JSON.stringify(body)));
  return `${payload}.${sign(payload, secret)}`;
}

function readToken(token: string, secret: string): SessionUser | null {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // Recompute the signature and compare in constant time — the whole point of
  // the HMAC is that a client can't alter the payload without knowing AUTH_SECRET.
  const expected = sign(payload, secret);
  if (sig.length !== expected.length || !safeEqual(sig, expected)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (typeof body.u !== 'string' || typeof body.exp !== 'number') return null;
    if (body.exp < Date.now()) return null; // expired
    return { username: body.u };
  } catch {
    return null;
  }
}

// ---- Cookie plumbing --------------------------------------------------------

/** Build the Set-Cookie attributes for a freshly issued session. */
export function sessionCookieFor(user: SessionUser): {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: string;
    maxAge: number;
  };
} | null {
  const secret = authSecret();
  if (!secret) return null;
  return {
    name: SESSION_COOKIE,
    value: makeToken(user, secret),
    options: {
      httpOnly: true, // not readable from JS — mitigates XSS session theft
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    },
  };
}

/** Cookie attributes that clear the session (logout). */
export function clearedSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: '',
    options: {
      httpOnly: true as const,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    },
  };
}

/**
 * The current logged-in user, or null. Reads and verifies the session cookie.
 * Safe to call from any server route/component.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const secret = authSecret();
  if (!secret) return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readToken(token, secret);
}

/**
 * Guard for a mutating API route. Returns the user when authenticated, or a
 * 401 Response to return directly when not:
 *
 *   const auth = await requireAuth();
 *   if (auth instanceof Response) return auth;
 *   // …auth.username is available here…
 */
export async function requireAuth(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (user) return user;
  return new Response(
    JSON.stringify({ error: 'Authentication required. Please log in to make changes.' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}
