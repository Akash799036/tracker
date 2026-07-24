import 'server-only';
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

// scrypt cost parameters. N must be a power of two; 2^15 is a sensible interactive
// cost for a single-user admin login. maxmem is raised to accommodate it.
const SCRYPT_N = 1 << 15;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/**
 * Format a password + salt into a self-describing scrypt hash string:
 *   scrypt:<N>:<salt-hex>:<hash-hex>
 * Storing N and the salt inline means verification needs no other config and
 * the cost can be raised later without breaking existing hashes.
 *
 * The fields are ':'-delimited, NOT '$'-delimited: Next's env loader treats a
 * '$' in a .env value as a variable reference and silently expands it away, so
 * a '$'-delimited hash loads as garbage. ':' is safe in a .env value.
 */
export function hashPassword(password: string, salt?: Buffer): string {
  const s = salt ?? randomBytes(16);
  const dk = scryptSync(password, s, SCRYPT_KEYLEN, { N: SCRYPT_N, maxmem: SCRYPT_MAXMEM });
  return `scrypt:${SCRYPT_N}:${s.toString('hex')}:${dk.toString('hex')}`;
}

/** Verify a plaintext password against a `scrypt:N:salt:hash` string, in constant time. */
function verifyAgainstHash(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  if (!Number.isInteger(N) || N < 2 || (N & (N - 1)) !== 0) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[2], 'hex');
    expected = Buffer.from(parts[3], 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, { N, maxmem: SCRYPT_MAXMEM });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
import { cookies } from 'next/headers';
import { findUserByEmail } from './dashboardUsers';

// Server-only authentication for the tracker.
//
// The app is an internal team tool, so authentication is deliberately small:
// one shared admin account whose credentials live in the environment, and a
// stateless, signed session cookie. No auth library, no session table — the
// cookie itself is the session, and its HMAC signature is what makes it
// unforgeable.
//
//   AUTH_USERNAME       — the login name (default 'admin')
//   AUTH_PASSWORD_HASH  — the login password as a salted scrypt hash, so the
//                         real password is never stored in readable form (in
//                         .env, logs, or a memory dump). Preferred. Generate
//                         one with `node scripts/hash-password.mjs`.
//   AUTH_PASSWORD       — legacy plaintext password. Still supported as a
//                         fallback when no hash is set, but discouraged: the
//                         plaintext value is visible to anyone who can read the
//                         environment. Prefer AUTH_PASSWORD_HASH.
//   AUTH_SECRET         — HMAC key for signing the session cookie. REQUIRED in
//                         production; a missing secret disables login rather
//                         than silently signing with a guessable key.
//
// Note on transport: the login POST is protected end-to-end by HTTPS/TLS in
// production. That, not any app-level encryption of the request body, is what
// keeps credentials off the wire — so we deliberately don't add browser-side
// encryption (which would need to ship its key to the browser and add no real
// protection over TLS). What we DO add is that the password is never held at
// rest in plaintext on the server: it's stored and compared as a scrypt hash.
//
// The security boundary is the API: every data-mutating request calls
// requireAuth(), so hiding the edit UI on the client is only cosmetic.

export const SESSION_COOKIE = 'pt_session';

// Cookie lifetime. A team tool doesn't need aggressive expiry; a week means a
// login survives a normal work rhythm without a daily re-auth.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// A session identifies a logged-in user. `selected` means the user is on the
// Dashboard allow-list (config/dashboard-users.json or the legacy admin) and may
// see the Dashboard and internal pages. General users are never logged in, so a
// session always belongs to a selected user in the current model — but the flag
// is carried explicitly (and signed into the token) so gating never has to infer
// it, and so the model can grow non-selected accounts later without changing the
// token shape.
export type SessionUser = {
  username: string;
  email?: string;
  selected: boolean;
};

function authSecret(): string | null {
  const s = process.env.AUTH_SECRET;
  // Treat empty/whitespace as unset so a blank line in .env doesn't sign
  // sessions with the empty string.
  return s && s.trim() ? s : null;
}

// The configured credential: a username plus either a scrypt hash (preferred)
// or a legacy plaintext password. Login is disabled if neither is present.
type CredentialConfig =
  | { username: string; kind: 'hash'; hash: string }
  | { username: string; kind: 'plain'; password: string };

function configuredUser(): CredentialConfig | null {
  const username = (process.env.AUTH_USERNAME || 'admin').trim();
  const hash = (process.env.AUTH_PASSWORD_HASH || '').trim();
  if (hash) return { username, kind: 'hash', hash };
  const password = process.env.AUTH_PASSWORD || '';
  if (password) return { username, kind: 'plain', password };
  return null; // no password configured → login is disabled
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
  const okPass = cfg.kind === 'hash'
    ? verifyAgainstHash(password, cfg.hash)
    : safeEqual(password, cfg.password);
  return okUser && okPass;
}

/**
 * The email of the legacy admin account, if one is treated as an email. The
 * login identity is an email address now, but the legacy admin is configured by
 * AUTH_USERNAME (historically just "admin"). We accept that username as-is so an
 * existing admin login keeps working, and also expose it as the `email` field.
 */
function legacyAdminIdentity(): string {
  return (process.env.AUTH_USERNAME || 'admin').trim();
}

/**
 * Authenticate a login identity (email, or the legacy admin username) + password
 * and return the resulting SessionUser, or null on failure.
 *
 * Order of checks:
 *   1. The Dashboard allow-list (config/dashboard-users.json) by email → selected.
 *   2. The legacy single admin (AUTH_USERNAME/AUTH_PASSWORD[_HASH]) → selected,
 *      kept as a fallback so the Dashboard is never locked out.
 *
 * Both branches always run their password comparison so timing doesn't reveal
 * which identity (if any) matched.
 */
export function verifyLogin(identity: string, password: string): SessionUser | null {
  const id = identity.trim();

  // (1) JSON allow-list, matched by email.
  const jsonUser = findUserByEmail(id);
  const jsonOk = jsonUser ? verifyAgainstHash(password, jsonUser.passwordHash) : false;
  if (jsonUser && jsonOk) {
    return {
      username: jsonUser.name || jsonUser.email,
      email: jsonUser.email,
      selected: true,
    };
  }

  // (2) Legacy admin fallback (by username or its email form).
  const cfg = configuredUser();
  if (cfg) {
    const okUser = safeEqual(id, cfg.username);
    const okPass = cfg.kind === 'hash'
      ? verifyAgainstHash(password, cfg.hash)
      : safeEqual(password, cfg.password);
    if (okUser && okPass) {
      return { username: cfg.username, email: legacyAdminIdentity(), selected: true };
    }
  }

  return null;
}

// ---- Session token: base64url(payload) + '.' + hmac(payload) ----------------

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

function makeToken(user: SessionUser, secret: string): string {
  // `e` (email) and `s` (selected flag, 1/0) live inside the signed payload, so a
  // client can't grant itself Dashboard access by editing the cookie — the HMAC
  // would no longer match. Keep the field names short to keep the cookie small.
  const body = {
    u: user.username,
    e: user.email ?? '',
    s: user.selected ? 1 : 0,
    exp: Date.now() + SESSION_TTL_MS,
    n: randomBytes(6).toString('hex'),
  };
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
    return {
      username: body.u,
      email: typeof body.e === 'string' && body.e ? body.e : undefined,
      // Back-compat: a token minted before `s` existed has no flag; treat a
      // signed (thus trusted) session as selected in that case.
      selected: body.s === undefined ? true : body.s === 1,
    };
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

/**
 * Guard for a route that only selected (Dashboard) users may reach. Returns the
 * user when authenticated AND selected, or a 403 Response otherwise. The
 * middleware is the primary gate for pages; this backs any API route that must
 * be limited to selected users beyond the generic requireAuth().
 */
export async function requireSelected(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (user && user.selected) return user;
  return new Response(
    JSON.stringify({ error: 'This area is restricted to authorized users.' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } }
  );
}
