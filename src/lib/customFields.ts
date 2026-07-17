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
  rowKey: number;
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
  const rows = await query<(RowDataPacket & { field_id: number; row_key: number; value: string | null })[]>(
    `SELECT field_id, row_key, value FROM custom_field_values WHERE field_id IN (${placeholders})`,
    fieldIds
  );
  return rows.map(r => ({ fieldId: r.field_id, rowKey: r.row_key, value: r.value ?? '' }));
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

/** Verify a field belongs to the given page before mutating its values. */
async function fieldBelongsToPage(fieldId: number, pageKey: string): Promise<boolean> {
  const rows = await query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM custom_fields WHERE id = ? AND page_key = ? LIMIT 1',
    [fieldId, pageKey]
  );
  return rows.length > 0;
}

export async function setValue(
  pageKey: string, fieldId: number, rowKey: number, value: string
): Promise<boolean> {
  await ensureTables();
  if (!(await fieldBelongsToPage(fieldId, pageKey))) return false;
  await query<ResultSetHeader>(
    `INSERT INTO custom_field_values (field_id, row_key, value)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [fieldId, rowKey, value]
  );
  return true;
}
