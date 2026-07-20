import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, readSessionToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Lets the client shell know whether to show Data & Backup / the login button.
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = readSessionToken(token);
  return NextResponse.json(
    session ? { authenticated: true, username: session.username } : { authenticated: false }
  );
}
