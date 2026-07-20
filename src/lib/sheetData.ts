import { randomUUID } from 'node:crypto';
import { pool, query } from './db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { AllProjectsData, AllProjectsSheet, SheetRow, SheetRowRecord } from './allProjectsTypes';
// The schema and the reconciling sync live in scripts/lib/sheetStore.mjs so the
// seeder (plain .mjs, no build step) and this module share one implementation.
// Only read/mutation helpers that the app needs are defined here.
import {
  ensureTables as ensureTablesShared,
  syncPageData,
  parseJson,
  applyHeaderOrder,
  USER_ROW_INDEX_BASE,
} from '../../scripts/lib/sheetStore.mjs';

// Database-backed storage for the synced Google Sheet data.
//
//   sheet_tabs   — one row per (page_key, sheet_name) tab: ordered headers and a
//                  per-page synced-at timestamp.
//   sheet_rows   — one data row per sheet row, keyed by a stable row_uid that
//                  survives re-syncs. row_extras and custom_field_values point at
//                  that uid. cells holds the synced values; cells_override holds
//                  a user's edit, merged over cells on read so an edit is not
//                  lost at the next sync.
//   row_extras   — per-row ad-hoc key/value pairs (see rowExtras.ts).
//
// Tables are created lazily so no manual migration step is required for a fresh
// install. An EXISTING database needs `npm run migrate` once to add the identity
// columns — the seeder refuses to run without it.

let ensured = false;

export async function ensureSheetTables(): Promise<void> {
  if (ensured) return;
  await ensureTablesShared(pool);
  ensured = true;
}

/**
 * Reconcile one page's stored data against a freshly fetched workbook.
 * Preserves row identity and never deletes user-added rows.
 */
export async function replacePageData(
  pageKey: string,
  sheets: { name: string; headers: string[]; rows: SheetRow[] }[],
  syncedAt: number
): Promise<void> {
  await ensureSheetTables();
  const conn = await pool.getConnection();
  try {
    await syncPageData(conn, pageKey, sheets, syncedAt);
  } finally {
    conn.release();
  }
}

type StoredRow = RowDataPacket & {
  row_uid: string;
  origin: 'sheet' | 'user';
  hidden: number;
  cells: unknown;
  cells_override: unknown;
};

/** Read one page's stored sheets back in the shape the UI expects. */
export async function getPageData(pageKey: string): Promise<AllProjectsData | null> {
  await ensureSheetTables();
  const tabs = await query<(RowDataPacket & {
    id: number; sheet_name: string; position: number; headers: unknown;
    header_order: unknown; synced_at: number;
  })[]>(
    `SELECT id, sheet_name, position, headers, header_order, synced_at
       FROM sheet_tabs WHERE page_key = ? ORDER BY position ASC, id ASC`,
    [pageKey]
  );
  if (!tabs.length) return null;

  const sheets: AllProjectsSheet[] = [];
  let syncedAt = 0;
  for (const tab of tabs) {
    syncedAt = Math.max(syncedAt, Number(tab.synced_at) || 0);
    // The workbook order, permuted by the user's stored preference. Applying it
    // here — the one place every consumer's headers array is built — is what
    // makes both table renderers and the ?refresh=1 read-back agree, without
    // touching row data: cells are looked up by header name, never by index.
    const headers = applyHeaderOrder(
      parseJson(tab.headers, []) as string[],
      parseJson(tab.header_order, null) as string[] | null
    );
    const rowRows = await query<StoredRow[]>(
      `SELECT row_uid, origin, hidden, cells, cells_override
         FROM sheet_rows
        WHERE tab_id = ? AND hidden = 0
        ORDER BY sort_key ASC, row_index ASC`,
      [tab.id]
    );
    const rows: SheetRowRecord[] = rowRows.map(r => ({
      uid: r.row_uid,
      origin: r.origin,
      // A user's edit wins over the synced value, so edits survive a re-sync.
      cells: {
        ...(parseJson(r.cells, {}) as SheetRow),
        ...(parseJson(r.cells_override, {}) as SheetRow),
      },
    }));
    sheets.push({ name: tab.sheet_name, headers, rows });
  }

  return { sheets, syncedAt, source: 'google-sheets', sourceName: pageKey };
}

/**
 * Store a user's preferred column order for one sheet's built-in headers.
 *
 * Persisted as header NAMES so the preference survives the workbook gaining or
 * losing a column; `applyHeaderOrder` reconciles the drift on read. Writing to
 * `header_order` is safe across a re-sync because the sync upsert only ever
 * updates position, headers and synced_at.
 *
 * Rejects names that aren't currently headers of that sheet, so a stale client
 * can't write an order the renderer would then have to discard wholesale.
 */
export async function setHeaderOrder(
  pageKey: string, sheetName: string, order: string[]
): Promise<boolean> {
  await ensureSheetTables();
  const tab = await findTab(pageKey, sheetName);
  if (!tab) return false;
  const known = new Set(tab.headers);
  if (order.some(h => !known.has(h))) return false;
  if (new Set(order).size !== order.length) return false;

  await query<ResultSetHeader>(
    'UPDATE sheet_tabs SET header_order = ? WHERE page_key = ? AND sheet_name = ?',
    [JSON.stringify(order), pageKey, sheetName]
  );
  return true;
}

/** Resolve a tab, confirming it belongs to the given page. */
async function findTab(pageKey: string, sheetName: string) {
  const rows = await query<(RowDataPacket & { id: number; headers: unknown })[]>(
    'SELECT id, headers FROM sheet_tabs WHERE page_key = ? AND sheet_name = ? LIMIT 1',
    [pageKey, sheetName]
  );
  if (!rows.length) return null;
  return { id: rows[0].id, headers: parseJson(rows[0].headers, []) as string[] };
}

/**
 * Confirm a row belongs to the given page before mutating it or anything keyed
 * to it. Every route that accepts a client-supplied rowUid must call this —
 * without it, a uid from one page could be used to write to another.
 */
export async function rowBelongsToPage(rowUid: string, pageKey: string): Promise<boolean> {
  const rows = await query<(RowDataPacket & { row_uid: string })[]>(
    `SELECT r.row_uid FROM sheet_rows r
       JOIN sheet_tabs t ON t.id = r.tab_id
      WHERE r.row_uid = ? AND t.page_key = ? LIMIT 1`,
    [rowUid, pageKey]
  );
  return rows.length > 0;
}

/** Look up which sheet a row lives on, for scoping its extras. */
export async function getRowContext(
  rowUid: string, pageKey: string
): Promise<{ sheetName: string; headers: string[] } | null> {
  const rows = await query<(RowDataPacket & { sheet_name: string; headers: unknown })[]>(
    `SELECT t.sheet_name, t.headers FROM sheet_rows r
       JOIN sheet_tabs t ON t.id = r.tab_id
      WHERE r.row_uid = ? AND t.page_key = ? LIMIT 1`,
    [rowUid, pageKey]
  );
  if (!rows.length) return null;
  return { sheetName: rows[0].sheet_name, headers: parseJson(rows[0].headers, []) as string[] };
}

/**
 * Append a user-added row to a sheet.
 *
 * User rows are indexed from USER_ROW_INDEX_BASE so they stay clear of the
 * 0..n-1 block the seeder reassigns on every sync, and are marked origin='user'
 * so the seeder never deletes them. Unknown keys are dropped and missing headers
 * filled, so a row always matches the tab's shape.
 */
export async function insertUserRow(
  pageKey: string, sheetName: string, cells: Record<string, string>
): Promise<SheetRowRecord | null> {
  await ensureSheetTables();
  const tab = await findTab(pageKey, sheetName);
  if (!tab) return null;

  const clean: SheetRow = {};
  for (const h of tab.headers) clean[h] = typeof cells[h] === 'string' ? cells[h] : '';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [maxRows] = await conn.execute(
      `SELECT COALESCE(MAX(row_index), ?) AS max_idx, COALESCE(MAX(sort_key), 0) AS max_sort
         FROM sheet_rows WHERE tab_id = ? AND origin = 'user'`,
      [USER_ROW_INDEX_BASE - 1, tab.id]
    );
    const maxIdx = Number((maxRows as RowDataPacket[])[0]?.max_idx ?? USER_ROW_INDEX_BASE - 1);
    const maxSort = Number((maxRows as RowDataPacket[])[0]?.max_sort ?? 0);
    const rowIndex = Math.max(maxIdx + 1, USER_ROW_INDEX_BASE);
    if (!Number.isSafeInteger(rowIndex) || rowIndex > 2_000_000_000) {
      throw new Error('user row index space exhausted for this tab');
    }
    // Sort user rows after every seeded row so new entries land at the bottom.
    const [seedMax] = await conn.execute(
      `SELECT COALESCE(MAX(sort_key), -1) AS s FROM sheet_rows WHERE tab_id = ? AND origin = 'sheet'`,
      [tab.id]
    );
    const sortKey = Math.max(maxSort + 1, Number((seedMax as RowDataPacket[])[0]?.s ?? -1) + 1);

    const uid = randomUUID();
    await conn.execute(
      `INSERT INTO sheet_rows (tab_id, row_index, row_uid, origin, sort_key, nat_key, cells)
       VALUES (?, ?, ?, 'user', ?, NULL, ?)`,
      [tab.id, rowIndex, uid, sortKey, JSON.stringify(clean)]
    );
    await conn.commit();
    return { uid, origin: 'user', cells: clean };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Apply an edit to a row.
 *
 * For a user row the edit goes straight into `cells`. For a synced row it goes
 * into `cells_override`, which the sync preserves and getPageData merges over
 * `cells` — writing into `cells` directly would be overwritten at the next sync.
 */
export async function updateRowCells(
  pageKey: string, rowUid: string, cells: Record<string, string>
): Promise<boolean> {
  await ensureSheetTables();
  const rows = await query<(RowDataPacket & {
    origin: 'sheet' | 'user'; cells: unknown; cells_override: unknown; headers: unknown;
  })[]>(
    `SELECT r.origin, r.cells, r.cells_override, t.headers
       FROM sheet_rows r JOIN sheet_tabs t ON t.id = r.tab_id
      WHERE r.row_uid = ? AND t.page_key = ? LIMIT 1`,
    [rowUid, pageKey]
  );
  if (!rows.length) return false;
  const row = rows[0];
  const headers = parseJson(row.headers, []) as string[];

  const patch: SheetRow = {};
  for (const h of headers) {
    if (typeof cells[h] === 'string') patch[h] = cells[h];
  }

  if (row.origin === 'user') {
    const next = { ...(parseJson(row.cells, {}) as SheetRow), ...patch };
    await query<ResultSetHeader>(
      'UPDATE sheet_rows SET cells = ? WHERE row_uid = ?',
      [JSON.stringify(next), rowUid]
    );
  } else {
    const base = parseJson(row.cells, {}) as SheetRow;
    const prev = parseJson(row.cells_override, {}) as SheetRow;
    const merged: SheetRow = { ...prev, ...patch };
    // Only keep values that actually differ from the synced ones, so a field
    // edited back to its original stops shadowing future syncs.
    const override: SheetRow = {};
    for (const [k, v] of Object.entries(merged)) {
      if (String(base[k] ?? '') !== String(v ?? '')) override[k] = v;
    }
    await query<ResultSetHeader>(
      'UPDATE sheet_rows SET cells_override = ? WHERE row_uid = ?',
      [Object.keys(override).length ? JSON.stringify(override) : null, rowUid]
    );
  }
  return true;
}

/**
 * Remove a row.
 *
 * A user row is deleted outright, along with anything keyed to it. A synced row
 * is only hidden — deleting it would just bring it back at the next sync.
 */
export async function deleteRow(pageKey: string, rowUid: string): Promise<boolean> {
  await ensureSheetTables();
  const rows = await query<(RowDataPacket & { origin: 'sheet' | 'user' })[]>(
    `SELECT r.origin FROM sheet_rows r JOIN sheet_tabs t ON t.id = r.tab_id
      WHERE r.row_uid = ? AND t.page_key = ? LIMIT 1`,
    [rowUid, pageKey]
  );
  if (!rows.length) return false;

  if (rows[0].origin === 'user') {
    await query<ResultSetHeader>('DELETE FROM row_extras WHERE row_uid = ?', [rowUid]);
    await query<ResultSetHeader>('DELETE FROM custom_field_values WHERE row_uid = ?', [rowUid]);
    await query<ResultSetHeader>('DELETE FROM sheet_rows WHERE row_uid = ?', [rowUid]);
  } else {
    await query<ResultSetHeader>('UPDATE sheet_rows SET hidden = 1 WHERE row_uid = ?', [rowUid]);
  }
  return true;
}

/** Restore a synced row that was hidden. */
export async function restoreRow(pageKey: string, rowUid: string): Promise<boolean> {
  await ensureSheetTables();
  const res = await query<ResultSetHeader>(
    `UPDATE sheet_rows r JOIN sheet_tabs t ON t.id = r.tab_id
        SET r.hidden = 0
      WHERE r.row_uid = ? AND t.page_key = ?`,
    [rowUid, pageKey]
  );
  return res.affectedRows > 0;
}
