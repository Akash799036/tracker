// Edge-runtime session verification for middleware.ts.
//
// middleware runs on the Edge runtime, which has no `node:crypto`, so the HMAC
// check is reimplemented here against Web Crypto. The token format must stay in
// sync with `src/lib/auth.ts` (payload = "<user-base64url>.<expiry>").

export const SESSION_COOKIE = 'pt-session';

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** True if the cookie carries a valid, unexpired, correctly signed session. */
export async function hasValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [user64, expiresRaw, mac] = parts;

  const expected = await sign(`${user64}.${expiresRaw}`, secret);
  if (!timingSafeEqualHex(mac, expected)) return false;

  const expires = Number(expiresRaw);
  return Number.isFinite(expires) && expires >= Date.now();
}
