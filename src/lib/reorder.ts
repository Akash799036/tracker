// Shared ordering primitives. Both column kinds — synced sheet headers (ordered
// by name) and custom fields (ordered by id) — move identically, so the move
// semantics live here once rather than in each hook.

/** Move the item at `from` to index `to`, returning a new array. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const clamped = Math.max(0, Math.min(items.length - 1, to));
  if (from === clamped) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(clamped, 0, moved);
  return next;
}

/** True when the two arrays hold the same values in the same order. */
export function sameOrder<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
