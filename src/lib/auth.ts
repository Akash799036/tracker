import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'crypto';

// Server-only auth helpers for the single admin account.
//
// Credentials live in .env.local:
//   AUTH_USERNAME       — the admin login name
//   AUTH_PASSWORD_HASH  — scrypt hash, "salt:hash" hex (see scripts/hash-password.mjs)
//   AUTH_SECRET         — random string used to sign the session cookie
//
// The session cookie is a signed token, not encrypted: it carries the username
// and an expiry, plus an HMAC so it can't be forged client-side.

export const SESSION_COOKIE = 'pt-session';
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function secret(): string {
  const s = process.env.AUTH_SECRET;
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

/** Hash a plaintext password into the "salt:hash" form stored in env. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64).toString('hex');
  return safeEqual(candidate, hash);
}

/**
 * Check submitted credentials against the configured admin account.
 * Always runs the password hash even on an unknown username so the response
 * time doesn't reveal whether the name exists.
 */
export function verifyCredentials(username: string, password: string): boolean {
  const user = process.env.AUTH_USERNAME;
  const stored = process.env.AUTH_PASSWORD_HASH;
  if (!user || !stored) {
    throw new Error('Missing AUTH_USERNAME / AUTH_PASSWORD_HASH. Set them in .env.local');
  }
  const userOk = safeEqual(username, user);
  const passOk = verifyPassword(password, stored);
  return userOk && passOk;
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
