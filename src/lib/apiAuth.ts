import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from './auth';

/**
 * Whether the current request carries a valid session.
 *
 * Used by the public read routes to decide whether to redact credential
 * columns. These routes must keep serving logged-out visitors, so this returns
 * a boolean rather than short-circuiting with a 401.
 */
export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value) !== null;
}

/**
 * Reject the request unless it carries a valid session; returns null when the
 * caller may proceed.
 *
 * For the write handlers on otherwise-public routes. The proxy cannot gate
 * these paths — it matches on path, not method, and these same paths must still
 * serve GET to anonymous visitors — so the check has to happen in the handler.
 *
 *   const denied = await requireSession();
 *   if (denied) return denied;
 */
export async function requireSession(): Promise<NextResponse | null> {
  if (await isAuthenticated()) return null;
  return NextResponse.json({ error: 'authentication required' }, { status: 401 });
}
