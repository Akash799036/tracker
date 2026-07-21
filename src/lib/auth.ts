import { createHmac, timingSafeEqual } from 'crypto';
import { query } from './db';
import { verifyPassword } from './password';

// Server-only auth helpers.
//
// Accounts live in the `users` table on the live database (see
// scripts/migrate-users.mjs), one row per login with a scrypt password hash.
// Manage them with `npm run migrate:users` and `npm run user`.
//
// .env.local still supplies:
//   AUTH_SECRET     — random string used to sign the session cookie
//   AUTH_USERNAME / AUTH_PASSWORD — seed values for the migration only; they
//                     are NOT consulted at login time.
//
// The session cookie is a signed token, not encrypted: it carries the username
// and an expiry, plus an HMAC so it can't be forged client-side.

export const SESSION_COOKIE = 'pt-session';
// 30 days. The session also slides: every /api/auth/session check re-issues the
// cookie for a fresh 30 days (see that route), so an active user is never logged
// out mid-session — the window only lapses after 30 days of no visits at all.
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Re-issue the cookie only when it is more than this far into its life, so we
// aren't re-signing and setting a Set-Cookie header on every single poll.
const SESSION_RENEW_AFTER = 60 * 60 * 24; // 1 day

function secret(): string {
  // No fallback: passwords now live in the database, so AUTH_SECRET is the only
  // thing that can sign a session. middleware.ts requires it too — without it
  // every session would fail to validate at the edge.
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

type UserRow = { id: number; username: string; password_hash: string };

// A throwaway hash used to burn roughly the same CPU when the username doesn't
// exist, so response time doesn't reveal which accounts are real.
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/**
 * Check submitted credentials against the `users` table on the live database.
 *
 * A hash comparison always runs — even for an unknown username — so the
 * response time doesn't reveal which accounts exist. Database errors propagate
 * to the caller, which turns them into a 500 rather than a silent "wrong
 * password" that would be very confusing to debug.
 */
export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const rows = await query<UserRow[]>(
    'SELECT id, username, password_hash FROM users WHERE username = ? AND is_active = 1 LIMIT 1',
    [username]
  );
  const user = rows[0];

  // A password_hash that isn't in scrypt format means the column was edited by
  // hand (e.g. a plaintext password typed into phpMyAdmin). It can never match,
  // so login would fail as a plain "wrong password" with no hint as to why.
  // Log the real cause; still return false rather than trusting the value.
  if (user && !user.password_hash.startsWith('scrypt$')) {
    console.error(
      `[auth] user "${user.username}" has a password_hash that is not a scrypt hash — ` +
        'it looks like it was set by hand in the database. Passwords must be written ' +
        'with `npm run user -- password <username> <password>`, which hashes them.'
    );
  }

  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return false;

  // Best-effort bookkeeping; a failure here must not block a valid login.
  try {
    await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
  } catch {
    /* ignore */
  }
  return true;
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

/**
 * Given a still-valid session, decide whether its cookie should be re-issued to
 * slide the expiry forward. Returns a fresh token to set, or null to leave the
 * current cookie alone (so we don't write a Set-Cookie on every poll).
 *
 * A session issued for SESSION_MAX_AGE is due for renewal once it is more than
 * SESSION_RENEW_AFTER into that window.
 */
export function maybeRenewSessionToken(session: Session): string | null {
  const issuedAt = session.expires - SESSION_MAX_AGE * 1000;
  const age = Date.now() - issuedAt;
  if (age < SESSION_RENEW_AFTER * 1000) return null;
  return createSessionToken(session.username);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE,
};
