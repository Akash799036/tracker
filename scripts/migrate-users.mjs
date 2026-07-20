// Create the `users` table on the live database and seed the admin account.
//
//   npm run migrate:users
//
// The admin is seeded from AUTH_USERNAME / AUTH_PASSWORD in .env.local, so the
// credentials you already log in with keep working after the switch. Re-running
// is safe: the table is created only if missing, and an existing user is left
// untouched unless you pass --force-password.

import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { hashPassword } from './lib/password.mjs';

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    // fall back to the ambient environment (e.g. CI / Vercel)
  }
  return { ...env, ...process.env };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP    NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function main() {
  const env = loadEnv();
  const forcePassword = process.argv.includes('--force-password');

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, AUTH_USERNAME, AUTH_PASSWORD } = env;
  if (!DB_HOST || !DB_USER || !DB_NAME) {
    throw new Error('Missing DB_HOST / DB_USER / DB_NAME. Check .env.local');
  }
  // Seeding is optional. Once the admin exists, AUTH_USERNAME/AUTH_PASSWORD are
  // removed from .env.local, so this script's job narrows to ensuring the table
  // exists — accounts are managed with `npm run user` from then on.
  const canSeed = Boolean(AUTH_USERNAME && AUTH_PASSWORD);

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT ? Number(DB_PORT) : 3306,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  try {
    console.log(`Connected to ${DB_NAME} at ${DB_HOST}`);
    await conn.query(SCHEMA);
    console.log('✓ users table ready');

    if (!canSeed) {
      const [existing] = await conn.query('SELECT COUNT(*) AS n FROM users');
      console.log(
        existing[0].n > 0
          ? '• no AUTH_USERNAME/AUTH_PASSWORD in .env.local — nothing to seed (accounts already exist)'
          : '! table is empty and there are no seed credentials.\n' +
            '  Create the first account with:  npm run user -- add <username> <password>'
      );
    } else {
      const [rows] = await conn.execute(
        'SELECT id FROM users WHERE username = ? LIMIT 1',
        [AUTH_USERNAME]
      );

      if (rows.length === 0) {
        await conn.execute(
          'INSERT INTO users (username, password_hash) VALUES (?, ?)',
          [AUTH_USERNAME, await hashPassword(AUTH_PASSWORD)]
        );
        console.log(`✓ seeded admin user "${AUTH_USERNAME}" from .env.local`);
      } else if (forcePassword) {
        await conn.execute(
          'UPDATE users SET password_hash = ?, is_active = 1 WHERE username = ?',
          [await hashPassword(AUTH_PASSWORD), AUTH_USERNAME]
        );
        console.log(`✓ reset password for "${AUTH_USERNAME}" from .env.local`);
      } else {
        console.log(`• user "${AUTH_USERNAME}" already exists — left unchanged`);
        console.log('  (re-run with --force-password to reset it from .env.local)');
      }
    }

    const [all] = await conn.query('SELECT username, is_active FROM users ORDER BY id');
    console.log('\nAccounts:');
    for (const u of all) console.log(`  ${u.is_active ? '✓' : '✗'} ${u.username}`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
