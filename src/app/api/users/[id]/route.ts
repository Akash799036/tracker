import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { deleteUser, getUserById } from '@/lib/dashboardUsers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// DELETE /api/users/:id  — remove a managed user. Super-admin only.
//
// A super admin cannot delete their own account (that would risk locking the
// last admin out of user management). Deleting another super admin is allowed.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
  }

  const target = await getUserById(numId);
  if (!target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }
  // Guard: don't let an admin delete the account they're signed in as.
  if (auth.email && target.email.toLowerCase() === auth.email.toLowerCase()) {
    return NextResponse.json(
      { error: 'You cannot delete your own account.' },
      { status: 400 }
    );
  }

  const removed = await deleteUser(numId);
  if (!removed) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
