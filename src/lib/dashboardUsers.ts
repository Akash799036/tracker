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

export type DashboardUser = {
  /** Login identity — matched case-insensitively. */
  email: string;
  /** Optional display name; falls back to the email local-part. */
  name?: string;
  /** scrypt hash in the `scrypt:N:salt:hash` format (see src/lib/auth.ts). */
  passwordHash: string;
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
