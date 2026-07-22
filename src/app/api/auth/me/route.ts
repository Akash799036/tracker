import { NextResponse } from 'next/server';
import { authConfigured, getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/auth/me -> { user: {username} | null, authConfigured }
//
// The client bootstraps its auth state from this. `authConfigured` lets the UI
// explain "login is disabled on the server" instead of silently failing.
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user, authConfigured: authConfigured() });
}
