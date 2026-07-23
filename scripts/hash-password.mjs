// Generate a scrypt hash for the admin login password.
//
//   node scripts/hash-password.mjs                 # prompts (hidden input)
//   node scripts/hash-password.mjs 'my@password'   # password as an argument
//
// Prints an AUTH_PASSWORD_HASH=... line to paste into .env.local. Storing the
// hash instead of AUTH_PASSWORD means the real password is never held in
// readable form on the server. Keep this hashing in sync with src/lib/auth.ts.

import { scryptSync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

const SCRYPT_N = 1 << 15;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function hashPassword(password) {
  const salt = randomBytes(16);
  const dk = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, maxmem: SCRYPT_MAXMEM });
  // Colon-delimited, NOT '$'-delimited: a '$' in a .env value is treated as a
  // variable reference by Next's env loader and silently expanded away.
  return `scrypt:${SCRYPT_N}:${salt.toString('hex')}:${dk.toString('hex')}`;
}

// Read the password without echoing it to the terminal.
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const out = process.stdout;
    // Mute echo: intercept the readline output so typed characters aren't shown.
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
  let password = process.argv[2];
  if (!password) {
    password = await promptHidden('Enter password to hash: ');
  }
  if (!password) {
    console.error('No password provided.');
    process.exit(1);
  }
  const hash = hashPassword(password);
  console.log('\nAdd this line to .env.local (and remove any AUTH_PASSWORD=... line):\n');
  console.log(`AUTH_PASSWORD_HASH=${hash}`);
  console.log('\nRestart the dev server after changing .env.local.');
}

main();
