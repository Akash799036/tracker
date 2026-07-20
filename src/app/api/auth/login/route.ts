import { NextResponse } from 'next/server';
import { verifyCredentials, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { authConfigError } from '@/lib/authConfig';
import { badRequest, fail } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    // A misconfigured deployment (no AUTH_SECRET) would otherwise surface as an
    // opaque 500 from the signing step, after the password check has run.
    const configError = authConfigError();
    if (configError) {
      console.error('[auth] login unavailable:', configError);
      return NextResponse.json(
        { error: 'Login is not available: the server is misconfigured.' },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => null);
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!username || !password) return badRequest('username and password are required');

    let authed: boolean;
    try {
      authed = await verifyCredentials(username, password);
    } catch (e) {
      // The database is unreachable or the `users` table is missing. This is
      // NOT a wrong password — reporting it as 401 would send someone off
      // resetting credentials that were never the problem.
      console.error('[auth] credential check failed:', e);
      return NextResponse.json(
        { error: 'Login is temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    if (!authed) {
      // Deliberately vague: don't reveal which half was wrong.
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, username });
    res.cookies.set(SESSION_COOKIE, createSessionToken(username), sessionCookieOptions);
    return res;
  } catch (e) {
    return fail(e);
  }
}
