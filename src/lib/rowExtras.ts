import { query } from './db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { ensureSheetTables, rowBelongsToPage } from './sheetData';

// Per-row ad-hoc fields: key/value pairs attached to a single row.
//
// Deliberately NOT the custom_fields model. A custom field is a column added to
// the whole sheet — every row gets a cell for it. A row extra belongs to one row
// only, so rows can carry different sets of fields. Keep the two distinct: they
// look similar in the schema but mean different things to a user.
//
// row_extras has NO foreign key to sheet_rows. The sync deletes and re-inserts
// the seeded rows on every run, and a cascading FK would wipe extras mid-sync.
// Orphans are collected by sweepOrphanExtras() in scripts/lib/sheetStore.mjs,
// which the seeder runs after each page — that sweep is the only thing keeping
// the table from accumulating dead rows, so do not remove it.

export type RowExtra = {
  id: number;
  rowUid: string;
  label: string;
  value: string;
  position: number;
};

export const MAX_LABEL_LENGTH = 255;

type ExtraRow = RowDataPacket & {
  id: number; row_uid: string; label: string; value: string | null; position: number;
};

/** All extras for one sheet, in a single query, grouped by row uid. */
export async function listExtras(pageKey: string, sheetName: string): Promise<RowExtra[]> {
  await ensureSheetTables();
  const rows = await query<ExtraRow[]>(
    `SELECT id, row_uid, label, value, position
       FROM row_extras
      WHERE page_key = ? AND sheet_name = ?
      ORDER BY row_uid ASC, position ASC, id ASC`,
    [pageKey, sheetName]
  );
  return rows.map(r => ({
    id: r.id, rowUid: r.row_uid, label: r.label, value: r.value ?? '', position: r.position,
  }));
}

export type SetExtraResult =
  | { ok: true; extra: RowExtra }
  | { ok: false; reason: 'not-found' | 'invalid-label' | 'duplicate' };

/** Read one extra back after a write. */
async function readExtra(rowUid: string, label: string): Promise<RowExtra | null> {
  const rows = await query<ExtraRow[]>(
    'SELECT id, row_uid, label, value, position FROM row_extras WHERE row_uid = ? AND label = ? LIMIT 1',
    [rowUid, label]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, rowUid: r.row_uid, label: r.label, value: r.value ?? '', position: r.position };
}

/**
 * Validate a write and resolve the row's sheet. The caller has already checked
 * the page key; this confirms the row belongs to that page, so a uid from
 * another page cannot be used to write here.
 */
async function resolveTarget(
  pageKey: string, rowUid: string, label: string
): Promise<{ ok: true; sheetName: string; label: string } | { ok: false; reason: 'not-found' | 'invalid-label' }> {
  const clean = label.trim();
  if (!clean || clean.length > MAX_LABEL_LENGTH) return { ok: false, reason: 'invalid-label' };
  if (!(await rowBelongsToPage(rowUid, pageKey))) return { ok: false, reason: 'not-found' };
  const ctx = await query<(RowDataPacket & { sheet_name: string })[]>(
    `SELECT t.sheet_name FROM sheet_rows r JOIN sheet_tabs t ON t.id = r.tab_id
      WHERE r.row_uid = ? LIMIT 1`,
    [rowUid]
  );
  if (!ctx.length) return { ok: false, reason: 'not-found' };
  return { ok: true, sheetName: ctx[0].sheet_name, label: clean };
}

/**
 * Add a new extra to a row. Fails with 'duplicate' if the row already has one
 * with that label — use setExtra() to change an existing value.
 */
export async function addExtra(
  pageKey: string, rowUid: string, label: string, value: string
): Promise<SetExtraResult> {
  await ensureSheetTables();
  const target = await resolveTarget(pageKey, rowUid, label);
  if (!target.ok) return target;

  const posRows = await query<(RowDataPacket & { next: number })[]>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM row_extras WHERE row_uid = ?',
    [rowUid]
  );

  try {
    await query<ResultSetHeader>(
      `INSERT INTO row_extras (row_uid, page_key, sheet_name, label, value, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [rowUid, pageKey, target.sheetName, target.label, value, posRows[0]?.next ?? 0]
    );
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') return { ok: false, reason: 'duplicate' };
    throw e;
  }

  const extra = await readExtra(rowUid, target.label);
  return extra ? { ok: true, extra } : { ok: false, reason: 'not-found' };
}

/** Set an extra's value, creating it if the row does not have it yet. */
export async function setExtra(
  pageKey: string, rowUid: string, label: string, value: string
): Promise<SetExtraResult> {
  await ensureSheetTables();
  const target = await resolveTarget(pageKey, rowUid, label);
  if (!target.ok) return target;

  const posRows = await query<(RowDataPacket & { next: number })[]>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM row_extras WHERE row_uid = ?',
    [rowUid]
  );

  await query<ResultSetHeader>(
    `INSERT INTO row_extras (row_uid, page_key, sheet_name, label, value, position)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [rowUid, pageKey, target.sheetName, target.label, value, posRows[0]?.next ?? 0]
  );

  const extra = await readExtra(rowUid, target.label);
  return extra ? { ok: true, extra } : { ok: false, reason: 'not-found' };
}

/** Rename one extra, keeping its value. Fails if the new label is already used. */
export async function renameExtra(
  pageKey: string, rowUid: string, oldLabel: string, newLabel: string
): Promise<SetExtraResult> {
  await ensureSheetTables();
  const clean = newLabel.trim();
  if (!clean || clean.length > MAX_LABEL_LENGTH) return { ok: false, reason: 'invalid-label' };
  if (!(await rowBelongsToPage(rowUid, pageKey))) return { ok: false, reason: 'not-found' };

  const existing = await query<ExtraRow[]>(
    'SELECT id, row_uid, label, value, position FROM row_extras WHERE row_uid = ? AND label = ? LIMIT 1',
    [rowUid, oldLabel]
  );
  if (!existing.length) return { ok: false, reason: 'not-found' };

  try {
    await query<ResultSetHeader>(
      'UPDATE row_extras SET label = ? WHERE row_uid = ? AND label = ?',
      [clean, rowUid, oldLabel]
    );
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') return { ok: false, reason: 'duplicate' };
    throw e;
  }
  const r = existing[0];
  return {
    ok: true,
    extra: { id: r.id, rowUid: r.row_uid, label: clean, value: r.value ?? '', position: r.position },
  };
}

export async function deleteExtra(pageKey: string, rowUid: string, label: string): Promise<boolean> {
  await ensureSheetTables();
  if (!(await rowBelongsToPage(rowUid, pageKey))) return false;
  const res = await query<ResultSetHeader>(
    'DELETE FROM row_extras WHERE row_uid = ? AND label = ? AND page_key = ?',
    [rowUid, label, pageKey]
  );
  return res.affectedRows > 0;
}

/** Drop every extra on a row. Used when a user row is deleted outright. */
export async function deleteExtrasForRow(rowUid: string): Promise<number> {
  await ensureSheetTables();
  const res = await query<ResultSetHeader>('DELETE FROM row_extras WHERE row_uid = ?', [rowUid]);
  return res.affectedRows;
}
