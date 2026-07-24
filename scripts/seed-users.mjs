// Seeder: load the Dashboard allow-list into the database with roles.
//
//   node scripts/seed-users.mjs
//
// Reads config/dashboard-users.json (email + name + scrypt passwordHash for each
// user), then upserts every entry into the app_users table, assigning:
//
//   role 1 (SUPER ADMIN)   → the admin email (SUPER_ADMIN_EMAIL below)
//   role 2 (GENERAL USER)  → everyone else in the allow-list
//
// Re-running is safe: users are matched by email and refreshed in place, so the
// seeder never creates duplicates and always re-asserts roles from this source
// of truth. DB credentials come from .env.local (DB_HOST/DB_USER/...).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';
import {
  ensureUserTable,
  upsertUser,
  ROLE_SUPER_ADMIN,
  ROLE_GENERAL_USER,
} from './lib/userStore.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// The super-admins (role 1). Everyone else in the allow-list is role 2.
// Compared case-insensitively.
const SUPER_ADMIN_EMAILS = [
  'akash.chakraborty@webart.technology',
  'biswajit@webart.technology',
  'sudip@webart.technology',
  'sayandip.saha@webart.technology',
  'kamini.thakur@webart.technology',
  'sudipto@digitalwebber.com',
];
const SUPER_ADMIN_SET = new Set(SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()));

// --- minimal .env.local loader (mirrors the other scripts) ----------------
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    let raw;
    try { raw = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let [, key, val] = m;
      if (key.startsWith('#')) continue;
      val = val.replace(/^["'](.*)["']$/, '$1');
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

function loadAllowList() {
  const path = join(ROOT, 'config', 'dashboard-users.json');
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`Could not read ${path}. Is the allow-list present?`);
    process.exit(1);
  }
  const parsed = JSON.parse(raw);
  const users = Array.isArray(parsed.users) ? parsed.users : [];
  return users.flatMap((u) => {
    const email = typeof u.email === 'string' ? u.email.trim() : '';
    const passwordHash = typeof u.passwordHash === 'string' ? u.passwordHash : '';
    if (!email || !passwordHash) return [];
    return [{ email, name: typeof u.name === 'string' ? u.name : null, passwordHash }];
  });
}

async function main() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_NAME) {
    console.error('Missing DB config. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env.local');
    process.exit(1);
  }

  const allowList = loadAllowList();
  if (!allowList.length) {
    console.error('No users found in config/dashboard-users.json — nothing to seed.');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT ? Number(DB_PORT) : 3306,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: false,
  });

  console.log(`Seeding users into ${DB_USER}@${DB_HOST}:${DB_PORT || 3306}/${DB_NAME}`);
  await ensureUserTable(conn);

  let admins = 0;
  let generals = 0;
  for (const u of allowList) {
    const role = SUPER_ADMIN_SET.has(u.email.toLowerCase()) ? ROLE_SUPER_ADMIN : ROLE_GENERAL_USER;
    await upsertUser(conn, { email: u.email, name: u.name, passwordHash: u.passwordHash, role });
    const label = role === ROLE_SUPER_ADMIN ? 'role 1 (super admin)' : 'role 2 (general user)';
    console.log(`  • ${u.email.padEnd(38)} → ${label}`);
    if (role === ROLE_SUPER_ADMIN) admins++; else generals++;
  }

  await conn.end();

  console.log(`\nDone. ${allowList.length} user(s) seeded — ${admins} super admin, ${generals} general.`);
  if (admins === 0) {
    console.log(
      `! No user matched any SUPER_ADMIN_EMAILS. ` +
      `Check those emails exist in config/dashboard-users.json.`
    );
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
