// Generate the AUTH_PASSWORD_HASH value for .env.local.
//
//   node scripts/hash-password.mjs "your-password"
//
// Copy the printed line into .env.local alongside AUTH_USERNAME and AUTH_SECRET.

import { randomBytes, scryptSync } from 'crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your-password"');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');

console.log('\nAdd these to .env.local:\n');
console.log(`AUTH_PASSWORD_HASH=${salt}:${hash}`);
console.log(`AUTH_SECRET=${randomBytes(32).toString('hex')}`);
console.log('');
