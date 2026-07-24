import { NextResponse, type NextRequest } from 'next/server';

// Access gate for the whole app.
//
// Model: only "selected" users (the Dashboard allow-list) may reach the
// Dashboard and internal pages. Everyone else is a general user who may only use
// the Live Projects submission form. This middleware is the AUTHORITATIVE gate —
// it runs before any page/route handler, so a general user can never load the
// Dashboard HTML or hit its data APIs. Client-side checks are only there to
// avoid a content flash.
//
// It re-verifies the signed session cookie here (in the Edge runtime) rather than
// importing src/lib/auth.ts, which is server-only and uses node:crypto. We only
// need to check the HMAC signature + expiry and read the `selected` flag — no
// password hashing — so a small Web Crypto HMAC verify is enough.

const SESSION_COOKIE = 'pt_session';

// The form and the login page are the only pages a general (not-selected) user
// may open. Everything else redirects them to the form.
const PUBLIC_PAGES = ['/website-delivery-2', '/login'];

// API routes a general user may call: the form submit, and the auth endpoints
// (so login/me/logout/pubkey keep working while signed out).
const PUBLIC_API_PREFIXES = ['/api/website-delivery-submit', '/api/auth/'];

const FORM_PATH = '/website-delivery-2';

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: ArrayBuffer): string {
  let bin = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Verify the `payload.signature` token and return its decoded body if the HMAC
// matches and it hasn't expired. Mirrors makeToken/readToken in src/lib/auth.ts.
async function verifyToken(
  token: string,
  secret: string
): Promise<{ selected: boolean } | null> {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expected = bytesToB64url(digest);
    // Length check first, then constant-ish comparison. Timing here is not a
    // meaningful attack surface (the attacker would need AUTH_SECRET regardless),
    // but keep it tidy.
    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
  } catch {
    return null;
  }

  try {
    const json = new TextDecoder().decode(b64urlToBytes(payload));
    const body = JSON.parse(json) as { exp?: number; s?: number };
    if (typeof body.exp !== 'number' || body.exp < Date.now()) return null;
    // Back-compat: a token minted before `s` existed → treat a valid signed
    // session as selected.
    const selected = body.s === undefined ? true : body.s === 1;
    return { selected };
  } catch {
    return null;
  }
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths are always allowed.
  if (isPublicPath(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = secret && token ? await verifyToken(token, secret) : null;

  if (session && session.selected) return NextResponse.next();

  // Not a selected user. Data APIs get a JSON 403; pages get redirected to the
  // form so a general user always lands on the one thing they can use.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'This area is restricted to authorized users.' },
      { status: 403 }
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = FORM_PATH;
  url.search = '';
  return NextResponse.redirect(url);
}

// Run on everything except Next internals and static assets. Public pages/APIs
// are still let through by isPublicPath above; excluding assets here just avoids
// the work on files that never need gating.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf|css|js|map)$).*)'],
};
