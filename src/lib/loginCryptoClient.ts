'use client';

// Client half of the login payload obfuscation. Fetches the server's ephemeral
// RSA public key and encrypts {username,password} with RSA-OAEP via Web Crypto,
// so the credentials appear as ciphertext (not plaintext) in the DevTools
// Payload tab.
//
// This is cosmetic, NOT a security boundary: the real transport security is
// HTTPS/TLS. See src/lib/loginCrypto.ts. If anything here fails (old browser,
// key fetch error), the caller falls back to sending plaintext over TLS.

// Convert a PEM (SPKI) string to the ArrayBuffer that Web Crypto's importKey wants.
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Encrypt the credentials for the login request. Returns a base64 ciphertext
 * suitable for POST { enc }, or null if encryption isn't possible (caller should
 * then fall back to plaintext, which TLS still protects).
 */
export async function encryptCredentials(
  username: string,
  password: string
): Promise<string | null> {
  try {
    // Web Crypto is unavailable on insecure origins (non-localhost http://).
    if (typeof window === 'undefined' || !window.crypto?.subtle) return null;

    const res = await fetch('/api/auth/pubkey', { cache: 'no-store' });
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    if (typeof publicKey !== 'string' || !publicKey) return null;

    const key = await window.crypto.subtle.importKey(
      'spki',
      pemToArrayBuffer(publicKey),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );

    const plaintext = new TextEncoder().encode(JSON.stringify({ username, password }));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      key,
      plaintext
    );
    return bufToBase64(ciphertext);
  } catch {
    return null;
  }
}
