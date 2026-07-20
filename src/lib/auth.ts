import { createHmac, timingSafeEqual } from 'crypto';

// Server-only auth helpers for the single admin account.
//
// Credentials live in .env.local:
//   AUTH_USERNAME   — the admin login name
//   AUTH_PASSWORD   — the admin password, in plain text
//   AUTH_SECRET     — random string used to sign the session cookie
//
// The password is compared directly, with no hashing. This is a deliberate
// simplification for a single-admin internal tool: it means the value in
// .env.local is always exactly what you type at the login form, with no
// generator step to get out of sync. Keep .env.local out of version control.
//
// The session cookie is a signed token, not encrypted: it carries the username
// and an expiry, plus an HMAC so it can't be forged client-side.

export const SESSION_COOKIE = 'pt-session';
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function secret(): string {
  // Fall back to the password so a missing AUTH_SECRET can't 500 the login
  // route; sessions are still signed, just tied to the current password.
  const s = process.env.AUTH_SECRET || process.env.AUTH_PASSWORD;
  if (!s) throw new Error('Missing AUTH_SECRET. Set it in .env.local');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

/** Constant-time string compare that tolerates length mismatches. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Check submitted credentials against the configured admin account.
 * Both comparisons always run so the response time doesn't reveal which half
 * was wrong. Returns false (not a throw) when unconfigured, so a bad .env
 * surfaces as a normal failed login rather than a 500.
 */
export function verifyCredentials(username: string, password: string): boolean {
  const user = process.env.AUTH_USERNAME;
  const pass = process.env.AUTH_PASSWORD;
  if (!user || !pass) return false;
  const userOk = safeEqual(username, user);
  const passOk = safeEqual(password, pass);
  return userOk && passOk;
}

/** True when the admin account is configured; used for a clearer login error. */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD);
}

/** Build a signed session token for the given user. */
export function createSessionToken(username: string): string {
  const expires = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = `${Buffer.from(username).toString('base64url')}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export type Session = { username: string; expires: number };

/** Validate a session token; returns null if forged, malformed, or expired. */
export function readSessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [user64, expiresRaw, mac] = parts;
  const payload = `${user64}.${expiresRaw}`;
  if (!safeEqual(mac, sign(payload))) return null;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  return { username: Buffer.from(user64, 'base64url').toString(), expires };
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE,
};
