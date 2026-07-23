import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

// At-rest encryption for sensitive form field values (passwords, cPanel logins,
// etc.). This is REAL encryption, unlike the cosmetic RSA login-payload
// obfuscation in loginCrypto.ts.
//
// Algorithm: AES-256-GCM. Each value gets a fresh 12-byte IV; the 16-byte auth
// tag is stored alongside the ciphertext so tampering is detectable on decrypt.
// Serialized as a single string:
//
//     enc:v1:<ivB64>:<tagB64>:<cipherB64>
//
// The `enc:v1:` prefix lets export/read code recognize an encrypted value without
// a separate schema, and lets us evolve the format later behind a new version tag.
//
// Key: FIELD_ENC_KEY from the environment. It may be either 32 raw bytes encoded
// as base64/hex, or any passphrase (hashed to 32 bytes with SHA-256). If the env
// var is unset, encryption throws — we never want to silently store a "sensitive"
// value in plaintext.

const PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.FIELD_ENC_KEY;
  if (!raw || !raw.trim()) {
    throw new Error(
      'FIELD_ENC_KEY is not set. It is required to store encrypted form fields. ' +
      'Set it in .env.local to a 32-byte key (base64/hex) or a strong passphrase.'
    );
  }
  const val = raw.trim();

  // Accept an exact 32-byte key given as base64 or hex; otherwise derive one from
  // the passphrase so any non-empty value works while the key stays 256-bit.
  const tryDecode = (encoding: 'base64' | 'hex'): Buffer | null => {
    try {
      const buf = Buffer.from(val, encoding);
      // Guard against base64 silently truncating a passphrase: require a clean
      // round-trip AND exactly 32 bytes.
      if (buf.length === 32 && buf.toString(encoding).replace(/=+$/, '') === val.replace(/=+$/, '')) {
        return buf;
      }
    } catch {
      /* fall through */
    }
    return null;
  };

  cachedKey = tryDecode('hex') ?? tryDecode('base64') ?? createHash('sha256').update(val, 'utf8').digest();
  return cachedKey;
}

/** True if a stored value is one this module produced. */
export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypt a plaintext string. Empty/whitespace-only input is returned as '' so
 * a blank field stays blank (and blank-to-keep on edit stays simple). Throws if
 * FIELD_ENC_KEY is missing — a sensitive value must never fall back to plaintext.
 */
export function encryptField(plaintext: string): string {
  if (plaintext == null || plaintext === '') return '';
  if (isEncrypted(plaintext)) return plaintext; // already encrypted; don't double-wrap
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypt a value produced by encryptField. A value that isn't in our format is
 * returned unchanged (so legacy plaintext or non-encrypted fields pass through).
 * Returns '' if the payload is malformed or fails authentication.
 */
export function decryptField(value: string): string {
  if (!isEncrypted(value)) return value;
  try {
    const rest = value.slice(PREFIX.length);
    const [ivB64, tagB64, cipherB64] = rest.split(':');
    if (!ivB64 || !tagB64 || !cipherB64) return '';
    const key = resolveKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(cipherB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return '';
  }
}
