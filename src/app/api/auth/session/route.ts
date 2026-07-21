import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  SESSION_COOKIE,
  readSessionToken,
  maybeRenewSessionToken,
  sessionCookieOptions,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Lets the client shell know whether to show Data & Backup / the login button.
//
// This is also the session's sliding-renewal point: the client polls it (on
// mount, on tab focus, and on an interval — see authClient.tsx), and whenever a
// still-valid session is more than a day into its life we re-issue the cookie
// for a fresh 30 days. So an actively-used session never lapses mid-work; only
// 30 days with no visit at all lets it expire.
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = readSessionToken(token);
  const res = NextResponse.json(
    session ? { authenticated: true, username: session.username } : { authenticated: false }
  );
  if (session) {
    const renewed = maybeRenewSessionToken(session);
    if (renewed) res.cookies.set(SESSION_COOKIE, renewed, sessionCookieOptions);
  }
  return res;
}
