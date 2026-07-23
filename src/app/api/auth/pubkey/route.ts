import { NextResponse } from 'next/server';
import { loginPublicKeyPem } from '@/lib/loginCrypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/auth/pubkey -> { publicKey: "<SPKI PEM>" }
//
// The browser fetches this before login and uses it to encrypt the credentials
// so they don't appear as plaintext in the network Payload tab. This is a public
// key by design — serving it to everyone is expected and safe. See
// src/lib/loginCrypto.ts for the (cosmetic, not security-adding) rationale.
export async function GET() {
  return NextResponse.json({ publicKey: loginPublicKeyPem() });
}
