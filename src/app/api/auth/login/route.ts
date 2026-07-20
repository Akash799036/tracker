import { NextResponse } from 'next/server';
import { verifyCredentials, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { badRequest, fail } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!username || !password) return badRequest('username and password are required');

    if (!(await verifyCredentials(username, password))) {
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
