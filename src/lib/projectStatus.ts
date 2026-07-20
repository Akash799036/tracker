/**
 * Canonical project-status classification.
 *
 * The sheets carry free-text status cells typed by hand, so the same state is
 * spelled a dozen ways ('ongoing', 'Ongoing', 'on going', 'OnGoing', 'ongoin')
 * and many cells are whole sentences ('Project is live but ongoing work').
 * This module folds all of that onto five buckets the dashboard reports.
 *
 * Two rules drive the design, and both matter for correctness:
 *
 * 1. Order is significance, not convenience. A cell that mentions two states
 *    ('Project is live but ongoing work', 'site live, final issue fixing done')
 *    describes work still in flight, so `progress` has to win over `live`.
 *    Likewise 'Figma ongoing/Hold' is blocked, so `hold` outranks `progress`.
 * 2. Every non-empty cell lands in exactly one bucket. The old classifier let
 *    unmatched values fall into an `other` bucket no card displayed, so the
 *    numbers silently under-reported. Here anything unmatched is `unknown`,
 *    which is surfaced rather than hidden.
 */

export type StatusBucket = 'progress' | 'live' | 'review' | 'hold' | 'done' | 'notStarted' | 'unknown';

export type StatusCounts = {
  /** Rows counted, i.e. every non-empty status cell. */
  total: number;
  progress: number;
  live: number;
  review: number;
  hold: number;
  done: number;
  notStarted: number;
  unknown: number;
};

/** Match on word boundaries so 'live' does not fire inside 'delivered'. */
function has(s: string, ...words: string[]): boolean {
  return words.some(w => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, 'i').test(s));
}

/**
 * Classify one raw status cell. Returns null for blank cells so callers can
 * distinguish 'no status recorded' from 'status we could not read'.
 */
export function classifyStatus(raw: unknown): StatusBucket | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;

  // Explicit not-started, before anything else — 'Work not started yet' also
  // contains 'work', and 'Development work yet to begin' contains 'development'.
  if (has(s, 'not started', 'not start') || /yet to (begin|start)/.test(s)) return 'notStarted';

  // Blocked beats everything: a paused project may still read 'Figma ongoing/Hold'.
  if (has(s, 'hold', 'paused', 'pause', 'onhold', 'blocked') || /\bon hold\b/.test(s)) return 'hold';

  // Awaiting someone else is a form of blocked, not of progress.
  if (/\b(waiting|awaiting)\b/.test(s) || /no update(s)? (from|yet|for)/.test(s)) return 'hold';

  // Verification phase, ahead of `progress`: a row reading 'testing issue
  // fixing' or 'Rechecking pending' is in QA, and the generic progress verbs
  // ('fixing', 'pending') would otherwise swallow it.
  if (
    has(s, 'review', 'reviewing', 'qa', 'retest', 'retesting') ||
    /\btest(ing)?\b/.test(s) ||
    /ready (to|for) (go )?(live|test)/.test(s) ||
    /\brecheck/.test(s)
  ) return 'review';

  // In-flight beats live/done: 'Project is live but ongoing work' is still work.
  if (
    has(s, 'ongoing', 'ongoin', 'wip', 'inprogress', 'started') ||
    /\bon\s?going\b/.test(s) ||
    /\bin[\s-]?progress\b/.test(s) ||
    /\bin[\s-]?process\b/.test(s) ||
    /\b(pending|remains|due)\b/.test(s) ||
    /\b(fixing|creating|working|updating|modification|approved)\b/.test(s)
  ) return 'progress';

  // Shipped. 'delivered'/'completed' count as live for the dashboard's purposes.
  if (
    has(s, 'live', 'delivered', 'deployed', 'launched') ||
    /\b(deliver|deploy|launch)/.test(s)
  ) return 'live';

  // Finished but not necessarily deployed.
  if (has(s, 'done', 'complete', 'completed') || /\ball (work|done)/.test(s)) return 'done';

  return 'unknown';
}

/** Tally a stream of raw status cells into the dashboard's buckets. */
export function countStatuses(values: Iterable<unknown>): StatusCounts {
  const out: StatusCounts = {
    total: 0, progress: 0, live: 0, review: 0, hold: 0, done: 0, notStarted: 0, unknown: 0,
  };
  for (const v of values) {
    const bucket = classifyStatus(v);
    if (!bucket) continue;
    out.total += 1;
    out[bucket] += 1;
  }
  return out;
}
