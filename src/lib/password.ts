import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCb) as (
  password: string, salt: Buffer, keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>;

// Password hashing for the `users` table, built on Node's bundled scrypt so the
// app needs no native dependency (bcrypt/argon2) to run.
//
// Stored format:  scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>
// The parameters travel with the hash, so raising the cost later doesn't
// invalidate passwords already in the database.
//
// Keep in sync with scripts/lib/password.mjs, which the CLI user tools use.

const N = 16384; // CPU/memory cost
const R = 8;     // block size
const P = 1;     // parallelization
const KEYLEN = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Verify a password against a stored hash. Never throws on malformed input. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
