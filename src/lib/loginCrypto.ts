import 'server-only';
import {
  generateKeyPairSync,
  privateDecrypt,
  constants,
  type KeyObject,
} from 'node:crypto';

// Transport-obfuscation for the login payload.
//
// IMPORTANT — read this before relying on it for security:
// The login request is ALREADY encrypted end-to-end by HTTPS/TLS in production.
// This module does NOT add meaningful security on top of that. Its only purpose
// is cosmetic: so the browser DevTools "Payload" tab shows ciphertext instead of
// the plaintext username/password. A determined attacker can still recover the
// password (they can call /api/auth/pubkey and encrypt their own guesses, or
// read the client code). Do not treat this as a substitute for TLS, rate
// limiting, or strong credentials.
//
// Design: the server holds an EPHEMERAL RSA keypair generated once per process
// start. The public key is served to the browser; the private key never leaves
// the server. The browser encrypts {username,password} with RSA-OAEP (Web
// Crypto) and posts the ciphertext. Because the key is ephemeral and asymmetric,
// there is no long-lived static secret baked into the client bundle — which is
// the least-bad way to do something that is inherently cosmetic.

let cached: { publicPem: string; privateKey: KeyObject } | null = null;

// Generate lazily and reuse for the process lifetime. Restarting the server
// rotates the key (any in-flight encrypted payload from before the restart
// simply fails to decrypt and the user retries — acceptable for a login form).
function keys(): { publicPem: string; privateKey: KeyObject } {
  if (cached) return cached;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  cached = {
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey,
  };
  return cached;
}

/** The current public key as SPKI PEM, for the browser to import and encrypt with. */
export function loginPublicKeyPem(): string {
  return keys().publicPem;
}

/**
 * Decrypt a base64 RSA-OAEP(SHA-256) ciphertext produced by the browser.
 * Returns the plaintext string, or null if it can't be decrypted (wrong key,
 * malformed input, payload from before a key rotation, etc.).
 */
export function decryptLoginBlob(b64: string): string | null {
  try {
    const ciphertext = Buffer.from(b64, 'base64');
    if (ciphertext.length === 0) return null;
    const plain = privateDecrypt(
      {
        key: keys().privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      ciphertext
    );
    return plain.toString('utf8');
  } catch {
    return null;
  }
}
