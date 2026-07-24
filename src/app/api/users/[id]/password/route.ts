import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { setUserPassword } from '@/lib/dashboardUsers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/users/:id/password { password }  — reset a user's password.
// Super-admin only. The new password is hashed server-side (scrypt) before it
// touches the DB; the plaintext is never stored.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const password = String(body?.password ?? '');

  const result = await setUserPassword(numId, password);
  if (!result.ok) {
    const status = /not found/i.test(result.error) ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
