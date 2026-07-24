// Shared storage layer for application users and their roles.
//
// The Dashboard allow-list historically lived only in config/dashboard-users.json
// (a gitignored file of emails + scrypt password hashes). This module moves that
// same information into the database and adds a role to each user:
//
//   role 1 — SUPER ADMIN  (full access)
//   role 2 — GENERAL USER  (dashboard access, no admin powers)
//
// It is plain .mjs taking an explicit `conn` so the seeder (no build step, cannot
// import .ts) and the Next app can share the SAME schema and the SAME role
// values. Do not re-declare these constants elsewhere — import them from here (or
// from src/lib/roles.ts, which mirrors them for the TypeScript side).

/** role = 1 → super admin (full access). */
export const ROLE_SUPER_ADMIN = 1;
/** role = 2 → general user (dashboard access, no admin powers). */
export const ROLE_GENERAL_USER = 2;

// Match the collation the rest of the schema pins (see sheetStore.mjs) so joins
// and comparisons never hit an "Illegal mix of collations" error.
const COLLATE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci';

/** Create the app_users table if it does not exist. Safe to call repeatedly. */
export async function ensureUserTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      email         VARCHAR(255) NOT NULL,
      name          VARCHAR(255) NULL,
      password_hash VARCHAR(255) NOT NULL,
      -- 1 = super admin, 2 = general user. See ROLE_* constants above.
      role          TINYINT UNSIGNED NOT NULL DEFAULT ${ROLE_GENERAL_USER},
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      -- Email is the login identity; store it lower-cased so lookups are
      -- case-insensitive without a functional index.
      UNIQUE KEY uq_app_users_email (email)
    ) ${COLLATE}
  `);
}

/**
 * Upsert one user, preserving the row's identity (and its id) on a re-seed.
 * A re-run refreshes name / password_hash / role from the source of truth
 * (dashboard-users.json) rather than inserting a duplicate.
 */
export async function upsertUser(conn, { email, name, passwordHash, role }) {
  const normEmail = String(email).trim().toLowerCase();
  await conn.execute(
    `INSERT INTO app_users (email, name, password_hash, role)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name),
                             password_hash = VALUES(password_hash),
                             role = VALUES(role)`,
    [normEmail, name ?? null, passwordHash, role]
  );
}

/** Case-insensitive lookup of a user by email, or null. */
export async function findUserByEmail(conn, email) {
  const needle = String(email).trim().toLowerCase();
  if (!needle) return null;
  const [rows] = await conn.execute(
    'SELECT id, email, name, password_hash, role FROM app_users WHERE email = ? LIMIT 1',
    [needle]
  );
  return rows.length ? rows[0] : null;
}
