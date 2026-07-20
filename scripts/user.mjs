// Manage login accounts in the `users` table on the live database.
//
//   npm run user -- list
//   npm run user -- add <username> <password>
//   npm run user -- password <username> <new-password>
//   npm run user -- disable <username>
//   npm run user -- enable  <username>
//   npm run user -- remove  <username>

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
    /* fall back to ambient environment */
  }
  return { ...env, ...process.env };
}

const USAGE = `Usage:
  npm run user -- list
  npm run user -- add <username> <password>
  npm run user -- password <username> <new-password>
  npm run user -- disable <username>
  npm run user -- enable <username>
  npm run user -- remove <username>`;

async function main() {
  const [command, username, password] = process.argv.slice(2);
  if (!command) {
    console.log(USAGE);
    process.exit(1);
  }

  const env = loadEnv();
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT ? Number(env.DB_PORT) : 3306,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  const needsUser = () => {
    if (!username) throw new Error(`"${command}" requires a username\n\n${USAGE}`);
  };
  const needsPassword = () => {
    if (!password) throw new Error(`"${command}" requires a password\n\n${USAGE}`);
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
  };
  const affected = res => res[0].affectedRows;

  try {
    switch (command) {
      case 'list': {
        const [rows] = await conn.query(
          'SELECT username, is_active, created_at, last_login_at FROM users ORDER BY id'
        );
        if (rows.length === 0) {
          console.log('No users. Run `npm run migrate:users` to seed the admin.');
          break;
        }
        for (const u of rows) {
          const last = u.last_login_at
            ? new Date(u.last_login_at).toISOString().slice(0, 16).replace('T', ' ')
            : 'never';
          console.log(`${u.is_active ? '✓' : '✗'} ${u.username.padEnd(24)} last login: ${last}`);
        }
        break;
      }

      case 'add': {
        needsUser();
        needsPassword();
        await conn.execute(
          'INSERT INTO users (username, password_hash) VALUES (?, ?)',
          [username, await hashPassword(password)]
        );
        console.log(`✓ created user "${username}"`);
        break;
      }

      case 'password': {
        needsUser();
        needsPassword();
        const res = await conn.execute(
          'UPDATE users SET password_hash = ? WHERE username = ?',
          [await hashPassword(password), username]
        );
        if (!affected(res)) throw new Error(`No such user "${username}"`);
        console.log(`✓ password updated for "${username}"`);
        break;
      }

      case 'enable':
      case 'disable': {
        needsUser();
        const active = command === 'enable' ? 1 : 0;
        const res = await conn.execute(
          'UPDATE users SET is_active = ? WHERE username = ?',
          [active, username]
        );
        if (!affected(res)) throw new Error(`No such user "${username}"`);
        console.log(`✓ ${command}d "${username}"`);
        break;
      }

      case 'remove': {
        needsUser();
        const res = await conn.execute('DELETE FROM users WHERE username = ?', [username]);
        if (!affected(res)) throw new Error(`No such user "${username}"`);
        console.log(`✓ removed "${username}"`);
        break;
      }

      default:
        throw new Error(`Unknown command "${command}"\n\n${USAGE}`);
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  const msg = err.code === 'ER_DUP_ENTRY' ? 'That username already exists' : err.message;
  console.error(`\n${msg}`);
  process.exit(1);
});
