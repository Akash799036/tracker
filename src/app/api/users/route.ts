import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { createUser, listUsers } from '@/lib/dashboardUsers';
import { ROLE_GENERAL_USER, ROLE_SUPER_ADMIN, type Role } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// User management API — super-admin (role 1) only. The requireSuperAdmin() guard
// is the real gate here; the /users UI merely hides itself for non-admins.
//
//   GET  /api/users            -> { users: ManagedUser[] }
//   POST /api/users {email,name,password,role?} -> { user: {id} }

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const email = String(body?.email ?? '');
  const name = body?.name != null ? String(body.name) : undefined;
  const password = String(body?.password ?? '');
  // Default new accounts to General User (role 2). A super admin can explicitly
  // request role 1, but anything other than the two known roles is coerced to
  // general user — the API never mints an unexpected role.
  const role: Role = body?.role === ROLE_SUPER_ADMIN ? ROLE_SUPER_ADMIN : ROLE_GENERAL_USER;

  const result = await createUser({ email, name, password, role });
  if (!result.ok) {
    // Duplicate-email is a conflict; everything else here is a bad request.
    const status = /already exists/i.test(result.error) ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ user: { id: result.id } }, { status: 201 });
}
