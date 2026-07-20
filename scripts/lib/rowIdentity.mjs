import { createHash } from 'node:crypto';

// Natural keys for sheet rows.
//
// A row's identity has to survive the seeder re-syncing every row on each run. A
// random UUID cannot do that on its own — after the rows are replaced there is
// nothing left to tell the seeder that incoming row 7 is the same record as the
// old row 7. So we fingerprint the row's *content* and match on that, carrying
// the UUID across whenever the fingerprint matches.
//
// Two strategies, in priority order:
//
//   1. A discovered identity column (or pair) — see discoverKeyHeaders(). Stable
//      across edits to every other cell, which is what we want.
//   2. A hash of every cell in header order. Needs no cooperation from the source,
//      but any upstream edit to any cell changes the fingerprint, so the row reads
//      as new and its extras/custom values orphan. That is a deliberate, visible
//      loss — strictly better than the positional keying it replaces, which
//      silently re-pointed values onto the *wrong* row.
//
// Measured against the live database (1274 rows / 24 tabs) when this was written:
// strategy 1 covers 14 tabs and 478 rows; the rest fall back to strategy 2. The
// seeder reports the split on every run so degradation stays visible.
//
// This module is plain .mjs with no dependencies so the Next app and the
// scripts/*.mjs seeder import the same implementation. Do not fork it: the repo
// already hand-mirrors some storage logic between src/lib and scripts/, and this
// is the one helper where drift corrupts data rather than going stale.

const sha1 = (s) => createHash('sha1').update(s, 'utf8').digest('hex');

const norm = (v) => (v == null ? '' : String(v)).trim();

/** Field separator that cannot appear in sheet text (ASCII unit separator). */
const SEP = String.fromCharCode(31);

// Columns holding mutable state rather than identity. Excluded from key
// discovery so flipping a status or adding a note does not churn a row's uid.
const VOLATILE_HEADER = /(status|note|remark|comment|password|cred|date|progress|update|stage|priority|phase)/i;

// A column only counts as identity if its NAME says so. A column that happens to
// be unique today (a person's name, a task type) is coincidence, not identity —
// keying on it would churn as soon as the data grows.
const IDENTITY_HEADER = /\b(id|name|title|url|domain|project|client|ticket|sr\.?\s*no|s\.?\s*no)\b/i;

/** Rows must be at least this unique on a candidate before we trust it. */
const MIN_UNIQUE_RATIO = 0.9;

/**
 * Discover the narrowest identity-bearing key for a tab, or null to fall back to
 * the content hash. Candidates must be complete (no blanks), non-volatile, and
 * identity-named. Single columns are preferred; pairs are tried when no single
 * column is unique.
 */
export function discoverKeyHeaders(headers, rows) {
  if (!rows.length) return null;
  const pool = (headers || []).filter(h =>
    !VOLATILE_HEADER.test(h) &&
    IDENTITY_HEADER.test(h) &&
    rows.every(r => norm(r?.[h]).length > 0)
  );
  if (!pool.length) return null;

  const uniqOf = (combo) =>
    new Set(rows.map(r => combo.map(h => norm(r?.[h])).join(SEP))).size;

  const singles = pool
    .map(h => ({ combo: [h], u: uniqOf([h]) }))
    .sort((a, b) => b.u - a.u);

  if (singles.length && singles[0].u === rows.length) return singles[0].combo;

  const limit = Math.min(pool.length, 6);
  for (let i = 0; i < limit; i++) {
    for (let j = i + 1; j < limit; j++) {
      const combo = [pool[i], pool[j]];
      if (uniqOf(combo) === rows.length) return combo;
    }
  }

  // Near-unique on an identity column still beats the content hash — the few
  // colliding rows get an occurrence suffix from naturalKeysForTab().
  return singles.length && singles[0].u >= rows.length * MIN_UNIQUE_RATIO
    ? singles[0].combo
    : null;
}

/**
 * Fingerprint one row.
 *
 * `keyHeaders` comes from discoverKeyHeaders() for the whole tab (pass null to
 * force the content hash). `occurrence` disambiguates rows that fingerprint
 * identically within a tab — pass the count of prior identical fingerprints so
 * duplicates get distinct, deterministic keys instead of colliding.
 */
export function naturalKey(headers, row, keyHeaders = null, occurrence = 0) {
  const basis = keyHeaders && keyHeaders.length
    ? 'k' + SEP + keyHeaders.map(h => norm(row?.[h])).join(SEP)
    : 'c' + SEP + (headers || []).map(h => norm(row?.[h])).join(SEP);
  return sha1(occurrence > 0 ? basis + SEP + '#' + occurrence : basis);
}

/**
 * Fingerprint every row in a tab, resolving duplicate-content collisions.
 * Returns { keyHeaders, keys } where keys[i] corresponds to rows[i].
 */
export function naturalKeysForTab(headers, rows) {
  const keyHeaders = discoverKeyHeaders(headers, rows);
  const counts = new Map();
  const keys = rows.map(row => {
    const base = naturalKey(headers, row, keyHeaders, 0);
    const n = counts.get(base) || 0;
    counts.set(base, n + 1);
    return n === 0 ? base : naturalKey(headers, row, keyHeaders, n);
  });
  return { keyHeaders, keys };
}
