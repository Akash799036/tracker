// Push the runtime env vars from .env.local into your Vercel project so the live
// site works: database credentials, AUTH_SECRET, the DASHBOARD_USERS_JSON
// allow-list, and FIELD_ENC_KEY. .env.local is git-ignored and never uploaded to
// Vercel, which is why the deployed app otherwise boots with no DB credentials
// and an empty Dashboard allow-list — this script fixes that. It also prunes the
// legacy single-admin login vars (see PRUNE) so the Dashboard backdoor can't
// linger on Vercel after being removed locally.
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
// Vars the live site needs: database credentials, plus the auth config. Notably
// DASHBOARD_USERS_JSON carries the Dashboard allow-list — config/dashboard-users.json
// is gitignored and never deploys, so without this env var the deployed app has an
// empty allow-list and no one can reach the Dashboard. AUTH_SECRET signs the
// session cookie and is required in production. FIELD_ENC_KEY decrypts stored
// form fields. Any key not present in .env.local is skipped (see OPTIONAL below).
const KEYS = [
  'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
  'AUTH_SECRET', 'DASHBOARD_USERS_JSON', 'FIELD_ENC_KEY',
];
// Keys that must exist in .env.local for the push to proceed. Others are pushed
// only when present, so an optional var (e.g. FIELD_ENC_KEY) can be absent.
const REQUIRED = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'AUTH_SECRET'];

// Keys that must NOT exist on Vercel — the legacy single-admin login. Dashboard
// access is the config/dashboard-users.json allow-list (shipped via
// DASHBOARD_USERS_JSON) only; leaving these set on Vercel would grant a backdoor
// admin login into the Dashboard. Removing them from .env.local does NOT remove
// them from Vercel — the push only adds keys — so we prune them here every run so
// the deployed environment can't silently drift back to having the backdoor.
const PRUNE = ['AUTH_USERNAME', 'AUTH_PASSWORD', 'AUTH_PASSWORD_HASH'];

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
const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing required keys in .env.local: ${missing.join(', ')}`);
  process.exit(1);
}
// Only push keys that are actually set, so optional vars can be absent.
const keysToPush = KEYS.filter((k) => env[k] != null && env[k] !== '');

for (const target of TARGETS) {
  for (const key of keysToPush) {
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

  // Prune the legacy backdoor keys. `vercel env rm` exits non-zero when the key
  // isn't set — that's the desired end state, so we don't treat it as an error.
  for (const key of PRUNE) {
    const res = spawnSync('npx', ['vercel', 'env', 'rm', key, target, '-y'], {
      cwd: ROOT,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    console.log(res.status === 0 ? `✗ removed ${key} → ${target}` : `· ${key} already absent → ${target}`);
  }
}

console.log('\nDone. Now redeploy so the new vars take effect:  npx vercel --prod');
