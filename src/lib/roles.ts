// Application role values. Mirrors scripts/lib/userStore.mjs — keep them in sync.
//
//   role 1 — SUPER ADMIN  (full access)
//   role 2 — GENERAL USER  (dashboard access, no admin powers)
//
// The seeder assigns these from config/dashboard-users.json (see
// scripts/seed-users.mjs). Login reads a user's role out of the DB.

export const ROLE_SUPER_ADMIN = 1;
export const ROLE_GENERAL_USER = 2;

export type Role = typeof ROLE_SUPER_ADMIN | typeof ROLE_GENERAL_USER;

/** True for the super-admin role only. */
export function isSuperAdmin(role: number | undefined): boolean {
  return role === ROLE_SUPER_ADMIN;
}

/** A human label for a role value, for UI. */
export function roleLabel(role: number | undefined): string {
  switch (role) {
    case ROLE_SUPER_ADMIN:
      return 'Super Admin';
    case ROLE_GENERAL_USER:
      return 'General User';
    default:
      return 'Unknown';
  }
}
