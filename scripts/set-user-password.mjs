// Set a user's login password directly in the app_users table.
//
//   node scripts/set-user-password.mjs <email> [password]   # one user
//   node scripts/set-user-password.mjs --all   [password]   # every user
//
// If the password is omitted it is read from the terminal without echoing.
// The password is hashed with the SAME scrypt parameters as the app
// (src/lib/auth.ts / scripts/hash-password.mjs), so the new password verifies
// on the next login. DB credentials come from .env.local.
//
// Examples:
//   node scripts/set-user-password.mjs akash.chakraborty@webart.technology
//   node scripts/set-user-password.mjs --all 'Sh4red-Temp-Pass!'

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scryptSync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import mysql from 'mysql2/promise';
import { ensureUserTable } from './lib/userStore.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SCRYPT_N = 1 << 15;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function hashPassword(password) {
  const salt = randomBytes(16);
  const dk = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, maxmem: SCRYPT_MAXMEM });
  // Colon-delimited (not '$') — see scripts/hash-password.mjs for why.
  return `scrypt:${SCRYPT_N}:${salt.toString('hex')}:${dk.toString('hex')}`;
}

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

// Read a password without echoing it to the terminal.
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const out = process.stdout;
    const origWrite = out.write.bind(out);
    let muted = false;
    out.write = (chunk, ...args) => (muted ? true : origWrite(chunk, ...args));
    origWrite(question);
    muted = true;
    rl.question('', (answer) => {
      muted = false;
      out.write = origWrite;
      origWrite('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node scripts/set-user-password.mjs <email|--all> [password]');
    process.exit(1);
  }

  const target = args[0];
  const all = target === '--all';
  let password = args[1];

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_NAME) {
    console.error('Missing DB config. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env.local');
    process.exit(1);
  }

  if (!password) {
    password = await promptHidden(all ? 'New password for ALL users: ' : `New password for ${target}: `);
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) {
      console.error('Passwords did not match.');
      process.exit(1);
    }
  }
  if (!password) {
    console.error('No password provided.');
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
  await ensureUserTable(conn);

  if (all) {
    // Each user gets a distinct salt/hash even with the same password.
    const [rows] = await conn.query('SELECT email FROM app_users');
    if (!rows.length) {
      console.error('No users in app_users. Run `npm run seed:users` first.');
      await conn.end();
      process.exit(1);
    }
    for (const r of rows) {
      await conn.execute('UPDATE app_users SET password_hash = ? WHERE email = ?', [hashPassword(password), r.email]);
      console.log(`  • ${r.email} — password updated`);
    }
    console.log(`\nDone. Updated ${rows.length} user(s).`);
  } else {
    const email = target.trim().toLowerCase();
    const [res] = await conn.execute('UPDATE app_users SET password_hash = ? WHERE email = ?', [hashPassword(password), email]);
    if (res.affectedRows === 0) {
      console.error(`No user found with email ${email}. Run \`npm run seed:users\` first, or check the address.`);
      await conn.end();
      process.exit(1);
    }
    console.log(`Password updated for ${email}.`);
  }

  await conn.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
