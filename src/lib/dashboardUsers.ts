import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The Dashboard allow-list.
//
// Access model: only "selected" users may see the Dashboard and the internal
// pages. Everyone else is a general user who can only use the Live Projects
// submission form. A selected user is anyone in the allow-list, loaded from
// (in priority order):
//   1. DASHBOARD_USERS_JSON — an env var holding the `{ "users": [...] }` JSON.
//      Used on hosts like Vercel where the file below is gitignored and never
//      deployed.
//   2. config/dashboard-users.json — the gitignored file (holds password
//      hashes), used for local development.
//
// This file is server-only: the user list and its password hashes must never be
// shipped to the browser.

import { ROLE_GENERAL_USER, ROLE_SUPER_ADMIN, type Role } from './roles';

export type DashboardUser = {
  /** Login identity — matched case-insensitively. */
  email: string;
  /** Optional display name; falls back to the email local-part. */
  name?: string;
  /** scrypt hash in the `scrypt:N:salt:hash` format (see src/lib/auth.ts). */
  passwordHash: string;
  /** 1 = super admin, 2 = general user. See src/lib/roles.ts. */
  role?: Role;
};

const CONFIG_PATH = join(process.cwd(), 'config', 'dashboard-users.json');

// Parse the `{ users: [...] }` shape into a validated DashboardUser[]. Shared by
// both the env-var and file loaders so the validation rules stay identical.
function parseUsers(raw: string): DashboardUser[] {
  const parsed = JSON.parse(raw) as { users?: unknown };
  return Array.isArray(parsed.users)
    ? (parsed.users as unknown[]).flatMap((u) => {
        const rec = u as Partial<DashboardUser>;
        if (typeof rec.email === 'string' && typeof rec.passwordHash === 'string' && rec.email.trim()) {
          return [{
            email: rec.email.trim(),
            name: typeof rec.name === 'string' ? rec.name : undefined,
            passwordHash: rec.passwordHash,
          }];
        }
        return [];
      })
    : [];
}

// Cache the parsed list. The source changes rarely (a deploy-time config), and
// re-parsing it on every login/middleware call is needless work. For the file
// source, `mtimeMs` lets us pick up edits without a server restart in dev.
let cache: { users: DashboardUser[]; mtimeMs: number } | null = null;

function loadUsers(): DashboardUser[] {
  // Preferred source: DASHBOARD_USERS_JSON env var. This is how the allow-list
  // reaches hosts (e.g. Vercel) where config/dashboard-users.json is gitignored
  // and never deployed. The var holds the same `{ "users": [...] }` JSON.
  const inline = process.env.DASHBOARD_USERS_JSON;
  if (inline && inline.trim()) {
    // mtimeMs: -1 is a sentinel that never collides with a real file mtime, so a
    // cached env-var parse is reused until the process restarts (env is static).
    if (cache && cache.mtimeMs === -1) return cache.users;
    try {
      const users = parseUsers(inline);
      cache = { users, mtimeMs: -1 };
      return users;
    } catch {
      // Malformed env value → fall through to the file so a bad var doesn't lock
      // everyone out where a valid file still exists (local dev).
    }
  }

  try {
    // statSync via readFileSync is fine here; we re-read only when the file's
    // mtime changed. Import lazily so a missing file is a soft failure.
    const { statSync } = require('node:fs') as typeof import('node:fs');
    const mtimeMs = statSync(CONFIG_PATH).mtimeMs;
    if (cache && cache.mtimeMs === mtimeMs) return cache.users;

    const users = parseUsers(readFileSync(CONFIG_PATH, 'utf8'));
    cache = { users, mtimeMs };
    return users;
  } catch {
    // No env var and missing/malformed file → empty allow-list. With the legacy
    // admin fallback removed, this means no one can reach the Dashboard, which is
    // the safe failure direction (deny, not grant).
    return [];
  }
}

/** Case-insensitive lookup of a selected user by email. */
export function findUserByEmail(email: string): DashboardUser | null {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  for (const u of loadUsers()) {
    if (u.email.toLowerCase() === needle) return u;
  }
  return null;
}

/** True if this email is on the Dashboard allow-list. */
export function isSelectedEmail(email: string): boolean {
  return findUserByEmail(email) !== null;
}

/**
 * DB-backed lookup of a selected user by email, including their role.
 *
 * The seeder (scripts/seed-users.mjs) loads config/dashboard-users.json into the
 * app_users table and assigns each user a role. This is the authoritative source
 * once seeded — it carries the role, which the JSON file does not. Returns null
 * if the user isn't in the table or the DB is unreachable, so callers can fall
 * back to the file-based findUserByEmail() (which grants no role).
 */
export async function findDbUserByEmail(email: string): Promise<DashboardUser | null> {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  try {
    const { query } = await import('./db');
    const rows = await query<
      { email: string; name: string | null; password_hash: string; role: number }[]
    >(
      'SELECT email, name, password_hash, role FROM app_users WHERE email = ? LIMIT 1',
      [needle]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      email: r.email,
      name: r.name ?? undefined,
      passwordHash: r.password_hash,
      role: (r.role === 1 ? 1 : ROLE_GENERAL_USER) as Role,
    };
  } catch {
    // DB not reachable / table not seeded yet → let the caller fall back to JSON.
    return null;
  }
}

/**
 * Whether any login source has at least one user: the seeded app_users table, or
 * the JSON allow-list. Lets authConfigured() report "login is set up" even when
 * the legacy admin credential is absent (the DB-users-only model). Returns false
 * on a DB error only when the JSON file is also empty.
 */
export async function hasAnyUser(): Promise<boolean> {
  try {
    const { query } = await import('./db');
    const rows = await query<{ n: number }[]>('SELECT COUNT(*) AS n FROM app_users');
    if (rows.length && Number(rows[0].n) > 0) return true;
  } catch {
    // Fall through to the file-based list.
  }
  return loadUsers().length > 0;
}

// ---- User management (super-admin only) -------------------------------------
//
// CRUD over the app_users table, backing the /users admin page and its API. All
// callers MUST be gated by requireSuperAdmin() (see src/lib/auth.ts) — nothing
// here re-checks the caller's role. Mirrors scripts/lib/userStore.mjs so the app
// and the seeder share one schema; the table's DDL lives there (ensureUserTable).

export type ManagedUser = {
  id: number;
  email: string;
  name?: string;
  role: Role;
  createdAt: string;
};

/** Basic email shape check — a login identity must look like an address. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** All managed users, newest first. Never returns password hashes. */
export async function listUsers(): Promise<ManagedUser[]> {
  const { query } = await import('./db');
  const rows = await query<
    { id: number; email: string; name: string | null; role: number; created_at: string }[]
  >('SELECT id, email, name, role, created_at FROM app_users ORDER BY created_at DESC, id DESC');
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name ?? undefined,
    role: (r.role === ROLE_SUPER_ADMIN ? ROLE_SUPER_ADMIN : ROLE_GENERAL_USER) as Role,
    createdAt: String(r.created_at),
  }));
}

/**
 * Create a user. Returns { ok } on success, or { ok:false, error } on a bad
 * input or a duplicate email. The password is hashed here (scrypt) before it
 * touches the DB — a plaintext password is never stored.
 */
export async function createUser(input: {
  email: string;
  name?: string;
  password: string;
  role?: Role;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: 'A valid email address is required.' };
  if (!input.password || input.password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  const role = input.role === ROLE_SUPER_ADMIN ? ROLE_SUPER_ADMIN : ROLE_GENERAL_USER;

  const { hashPassword } = await import('./auth');
  const passwordHash = hashPassword(input.password);

  const { getPool } = await import('./db');
  try {
    const [res] = await getPool().execute(
      'INSERT INTO app_users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
      [email, input.name?.trim() || null, passwordHash, role]
    );
    return { ok: true, id: (res as { insertId: number }).insertId };
  } catch (e) {
    // Duplicate email hits the unique key — report it as a clean 409-ish error
    // rather than a 500.
    if ((e as { code?: string })?.code === 'ER_DUP_ENTRY') {
      return { ok: false, error: 'A user with that email already exists.' };
    }
    throw e;
  }
}

/** Delete a user by id. Returns true if a row was removed. */
export async function deleteUser(id: number): Promise<boolean> {
  const { getPool } = await import('./db');
  const [res] = await getPool().execute('DELETE FROM app_users WHERE id = ?', [id]);
  return (res as { affectedRows: number }).affectedRows > 0;
}

/** Look up a single managed user by id (no password hash). */
export async function getUserById(id: number): Promise<ManagedUser | null> {
  const { query } = await import('./db');
  const rows = await query<
    { id: number; email: string; name: string | null; role: number; created_at: string }[]
  >('SELECT id, email, name, role, created_at FROM app_users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    email: r.email,
    name: r.name ?? undefined,
    role: (r.role === ROLE_SUPER_ADMIN ? ROLE_SUPER_ADMIN : ROLE_GENERAL_USER) as Role,
    createdAt: String(r.created_at),
  };
}

/**
 * Reset a user's password. Returns { ok } or an error for a too-short password
 * or an unknown id. The new password is hashed before storage.
 */
export async function setUserPassword(
  id: number,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  const { hashPassword } = await import('./auth');
  const { getPool } = await import('./db');
  const [res] = await getPool().execute(
    'UPDATE app_users SET password_hash = ? WHERE id = ?',
    [hashPassword(password), id]
  );
  if ((res as { affectedRows: number }).affectedRows === 0) {
    return { ok: false, error: 'User not found.' };
  }
  return { ok: true };
}
