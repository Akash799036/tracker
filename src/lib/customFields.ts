import { pool, query } from './db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

// Database-backed custom fields, defined per page + sheet tab.
//
//   custom_fields         — one row per user-added column, scoped to (page_key, sheet_name)
//   custom_field_values   — one row per (field, sheet row); row_key is the sheet's stable
//                           original row index (origIdx) as produced by the sync route.
//
// Tables are created lazily on first use so no manual migration step is required.

export type CustomField = {
  id: number;
  pageKey: string;
  sheetName: string;
  label: string;
  position: number;
};

export type CustomFieldValue = {
  fieldId: number;
  /** Stable row identity. Values are keyed by this, not by row position. */
  rowUid: string;
  value: string;
};

let ensured = false;

export async function ensureTables(): Promise<void> {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_fields (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      page_key    VARCHAR(64)  NOT NULL,
      sheet_name  VARCHAR(255) NOT NULL,
      label       VARCHAR(255) NOT NULL,
      position    INT          NOT NULL DEFAULT 0,
      created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_page_sheet (page_key, sheet_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_field_values (
      field_id  INT UNSIGNED NOT NULL,
      row_key   INT          NOT NULL,
      value     TEXT         NULL,
      PRIMARY KEY (field_id, row_key),
      CONSTRAINT fk_cfv_field FOREIGN KEY (field_id)
        REFERENCES custom_fields (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

export async function listFields(pageKey: string, sheetName?: string): Promise<CustomField[]> {
  await ensureTables();
  const where = sheetName != null
    ? 'WHERE page_key = ? AND sheet_name = ?'
    : 'WHERE page_key = ?';
  const params = sheetName != null ? [pageKey, sheetName] : [pageKey];
  const rows = await query<(RowDataPacket & {
    id: number; page_key: string; sheet_name: string; label: string; position: number;
  })[]>(
    `SELECT id, page_key, sheet_name, label, position
       FROM custom_fields ${where}
      ORDER BY position ASC, id ASC`,
    params
  );
  return rows.map(r => ({
    id: r.id, pageKey: r.page_key, sheetName: r.sheet_name, label: r.label, position: r.position,
  }));
}

export async function listValues(fieldIds: number[]): Promise<CustomFieldValue[]> {
  if (!fieldIds.length) return [];
  await ensureTables();
  const placeholders = fieldIds.map(() => '?').join(',');
  // Values written before the row-identity migration have no row_uid; skip them
  // rather than guessing which row they meant. `npm run migrate` backfills them.
  const rows = await query<(RowDataPacket & { field_id: number; row_uid: string | null; value: string | null })[]>(
    `SELECT field_id, row_uid, value
       FROM custom_field_values
      WHERE field_id IN (${placeholders}) AND row_uid IS NOT NULL`,
    fieldIds
  );
  return rows.map(r => ({ fieldId: r.field_id, rowUid: r.row_uid as string, value: r.value ?? '' }));
}

export async function addField(pageKey: string, sheetName: string, label: string): Promise<CustomField> {
  await ensureTables();
  const posRows = await query<(RowDataPacket & { next: number })[]>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM custom_fields WHERE page_key = ? AND sheet_name = ?',
    [pageKey, sheetName]
  );
  const position = posRows[0]?.next ?? 0;
  const res = await query<ResultSetHeader>(
    'INSERT INTO custom_fields (page_key, sheet_name, label, position) VALUES (?, ?, ?, ?)',
    [pageKey, sheetName, label, position]
  );
  return { id: res.insertId, pageKey, sheetName, label, position };
}

export async function deleteField(id: number, pageKey: string): Promise<boolean> {
  await ensureTables();
  const res = await query<ResultSetHeader>(
    'DELETE FROM custom_fields WHERE id = ? AND page_key = ?',
    [id, pageKey]
  );
  return res.affectedRows > 0;
}

/**
 * Persist a new ordering for one sheet's custom fields.
 *
 * `orderedIds` is the full set of field ids for (pageKey, sheetName) in their
 * new order. Rewriting every position in one transaction — rather than swapping
 * a pair — keeps positions dense and total, so a drag across several columns and
 * a single move up both land the same way.
 *
 * Returns false if the ids don't match exactly the fields on that sheet, which
 * is how a stale client (or one page's ids aimed at another) gets rejected
 * instead of silently reordering a subset.
 */
export async function reorderFields(
  pageKey: string, sheetName: string, orderedIds: number[]
): Promise<boolean> {
  await ensureTables();
  const existing = await listFields(pageKey, sheetName);
  if (existing.length !== orderedIds.length) return false;
  const known = new Set(existing.map(f => f.id));
  if (orderedIds.some(id => !known.has(id))) return false;
  if (new Set(orderedIds).size !== orderedIds.length) return false;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < orderedIds.length; i++) {
      await conn.execute(
        'UPDATE custom_fields SET position = ? WHERE id = ? AND page_key = ? AND sheet_name = ?',
        [i, orderedIds[i], pageKey, sheetName]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return true;
}

/** Verify a field belongs to the given page before mutating its values. */
async function fieldBelongsToPage(fieldId: number, pageKey: string): Promise<boolean> {
  const rows = await query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM custom_fields WHERE id = ? AND page_key = ? LIMIT 1',
    [fieldId, pageKey]
  );
  return rows.length > 0;
}

/**
 * Store one cell value, keyed by the row's stable uid.
 *
 * Both the field and the row must belong to the given page. row_key is still
 * written because it is half the legacy primary key, but it only mirrors the
 * row's current position — identity lives in row_uid, and an UPDATE-then-INSERT
 * on row_uid is what keeps a moved row from growing a second value row.
 */
export async function setValue(
  pageKey: string, fieldId: number, rowUid: string, value: string
): Promise<boolean> {
  await ensureTables();
  if (!(await fieldBelongsToPage(fieldId, pageKey))) return false;

  const rows = await query<(RowDataPacket & { row_index: number })[]>(
    `SELECT r.row_index FROM sheet_rows r
       JOIN sheet_tabs t ON t.id = r.tab_id
      WHERE r.row_uid = ? AND t.page_key = ? LIMIT 1`,
    [rowUid, pageKey]
  );
  if (!rows.length) return false;
  const rowKey = rows[0].row_index;

  const updated = await query<ResultSetHeader>(
    'UPDATE custom_field_values SET value = ?, row_key = ? WHERE field_id = ? AND row_uid = ?',
    [value, rowKey, fieldId, rowUid]
  );
  if (updated.affectedRows > 0) return true;

  await query<ResultSetHeader>(
    `INSERT INTO custom_field_values (field_id, row_key, row_uid, value)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), row_uid = VALUES(row_uid)`,
    [fieldId, rowKey, rowUid, value]
  );
  return true;
}
