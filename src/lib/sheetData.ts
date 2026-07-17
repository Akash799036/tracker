import { pool, query } from './db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { AllProjectsData, AllProjectsSheet, SheetRow } from './allProjectsTypes';

// Database-backed storage for the synced Google Sheet data.
//
//   sheet_tabs   — one row per (page_key, sheet_name) tab, storing the ordered
//                  header list and a per-page synced-at timestamp.
//   sheet_rows   — one data row per sheet row. row_index is the stable original
//                  index (origIdx) the sync route produced, so custom_field_values
//                  (keyed by the same row_key) stay aligned. Cells are stored as
//                  a JSON object { header: value }.
//
// Tables are created lazily so no manual migration step is required. The seeder
// (scripts/seed-sheets.mjs) fills them from Google; the app reads them back via
// getPageData() so it no longer depends on the Google Docs at runtime.

let ensured = false;

export async function ensureSheetTables(): Promise<void> {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sheet_tabs (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      page_key    VARCHAR(64)  NOT NULL,
      sheet_name  VARCHAR(255) NOT NULL,
      position    INT          NOT NULL DEFAULT 0,
      headers     JSON         NOT NULL,
      synced_at   BIGINT       NOT NULL DEFAULT 0,
      updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_page_sheet (page_key, sheet_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sheet_rows (
      tab_id     INT UNSIGNED NOT NULL,
      row_index  INT          NOT NULL,
      cells      JSON         NOT NULL,
      PRIMARY KEY (tab_id, row_index),
      CONSTRAINT fk_sheet_rows_tab FOREIGN KEY (tab_id)
        REFERENCES sheet_tabs (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

/**
 * Replace all stored data for one page with a fresh set of sheets.
 * Used by the seeder. Wrapped in a transaction so a page is never left
 * half-written.
 */
export async function replacePageData(
  pageKey: string,
  sheets: AllProjectsSheet[],
  syncedAt: number
): Promise<void> {
  await ensureSheetTables();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Removing the tabs cascades to their rows.
    await conn.execute('DELETE FROM sheet_tabs WHERE page_key = ?', [pageKey]);
    for (let pos = 0; pos < sheets.length; pos++) {
      const sheet = sheets[pos];
      const [res] = await conn.execute(
        'INSERT INTO sheet_tabs (page_key, sheet_name, position, headers, synced_at) VALUES (?, ?, ?, ?, ?)',
        [pageKey, sheet.name, pos, JSON.stringify(sheet.headers), syncedAt]
      );
      const tabId = (res as ResultSetHeader).insertId;
      // Batch the rows to keep the number of round-trips down.
      const BATCH = 200;
      for (let i = 0; i < sheet.rows.length; i += BATCH) {
        const slice = sheet.rows.slice(i, i + BATCH);
        const placeholders = slice.map(() => '(?, ?, ?)').join(', ');
        const params: (string | number)[] = [];
        slice.forEach((row, j) => {
          params.push(tabId, i + j, JSON.stringify(row));
        });
        await conn.execute(
          `INSERT INTO sheet_rows (tab_id, row_index, cells) VALUES ${placeholders}`,
          params
        );
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Read one page's stored sheets back in the AllProjectsData shape the UI expects. */
export async function getPageData(pageKey: string): Promise<AllProjectsData | null> {
  await ensureSheetTables();
  const tabs = await query<(RowDataPacket & {
    id: number; sheet_name: string; position: number; headers: unknown; synced_at: number;
  })[]>(
    `SELECT id, sheet_name, position, headers, synced_at
       FROM sheet_tabs WHERE page_key = ? ORDER BY position ASC, id ASC`,
    [pageKey]
  );
  if (!tabs.length) return null;

  const sheets: AllProjectsSheet[] = [];
  let syncedAt = 0;
  for (const tab of tabs) {
    syncedAt = Math.max(syncedAt, Number(tab.synced_at) || 0);
    const headers = parseJson<string[]>(tab.headers, []);
    const rowRows = await query<(RowDataPacket & { row_index: number; cells: unknown })[]>(
      'SELECT row_index, cells FROM sheet_rows WHERE tab_id = ? ORDER BY row_index ASC',
      [tab.id]
    );
    const rows: SheetRow[] = rowRows.map(r => parseJson<SheetRow>(r.cells, {}));
    sheets.push({ name: tab.sheet_name, headers, rows });
  }

  return { sheets, syncedAt, source: 'google-sheets', sourceName: pageKey };
}

// mysql2 returns JSON columns already parsed on most driver versions, but returns
// a string on others — handle both.
function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return v as T;
}
