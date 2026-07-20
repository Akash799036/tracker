// Fail-fast validation for the auth environment.
//
// The two failure modes this catches are both hard to diagnose from the
// symptom alone:
//
//   AUTH_SECRET missing  → login route 500s, and the edge middleware rejects
//                          every session, so /settings redirects to /login in
//                          what looks like a loop.
//   AUTH_SECRET changed  → all existing cookies silently stop validating and
//                          everyone is logged out at once.
//
// Both are configuration problems, not code problems, so we surface them with
// an explicit message rather than letting them read as a broken app.

/** Human-readable reason the auth config is unusable, or null when it's fine. */
export function authConfigError(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return 'AUTH_SECRET is not set. Sessions cannot be signed or verified. ' +
      'Set it in the deployment environment (for Vercel: `node scripts/push-vercel-env.mjs` then redeploy).';
  }
  if (secret.length < 32) {
    return 'AUTH_SECRET is too short (need at least 32 characters) to safely sign sessions.';
  }
  return null;
}
