// Push the DB_* variables from .env.local into your Vercel project so the live
// site can reach the database. .env.local is git-ignored and never uploaded to
// Vercel, which is why the deployed app boots with no DB credentials and shows
// no data — this script fixes that.
//
// Prerequisites (one time):
//   npx vercel login          # authenticate in your browser
//   npx vercel link           # connect this folder to its Vercel project
//
// Then:
//   node scripts/push-vercel-env.mjs            # push to production
//   node scripts/push-vercel-env.mjs preview    # also push to preview/dev
//
// After it finishes, redeploy (env changes only apply to NEW deployments):
//   npx vercel --prod

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// AUTH_SECRET signs the session cookie and is read by both the login route and
// the edge middleware. Without it the login route 500s and every session fails
// to validate, so it must ship alongside the DB credentials.
//
// AUTH_USERNAME / AUTH_PASSWORD are deliberately NOT pushed: logins are checked
// against the `users` table on the database, and those two are only seed values
// for `npm run migrate:users`, which is run locally against the live DB.
const KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'AUTH_SECRET'];

// Which Vercel environments to target. Default: production only.
const arg = (process.argv[2] || 'production').toLowerCase();
const TARGETS =
  arg === 'all' || arg === 'preview'
    ? ['production', 'preview', 'development']
    : ['production'];

function loadEnvLocal() {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || m[1].startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^["'](.*)["']$/, '$1');
  }
  return out;
}

const env = loadEnvLocal();
const missing = KEYS.filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(', ')}`);
  process.exit(1);
}

for (const target of TARGETS) {
  for (const key of KEYS) {
    // Remove any existing value first so re-runs don't error on "already exists".
    spawnSync('npx', ['vercel', 'env', 'rm', key, target, '-y'], {
      cwd: ROOT,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    // Pipe the value on stdin so the secret never appears in the process args.
    const res = spawnSync('npx', ['vercel', 'env', 'add', key, target], {
      cwd: ROOT,
      input: env[key] + '\n',
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: process.platform === 'win32',
    });
    if (res.status !== 0) {
      console.error(`\nFailed adding ${key} (${target}). Are you logged in and linked?`);
      console.error('Run:  npx vercel login   &&   npx vercel link');
      process.exit(1);
    }
    console.log(`✓ ${key} → ${target}`);
  }
}

console.log('\nDone. Now redeploy so the new vars take effect:  npx vercel --prod');
