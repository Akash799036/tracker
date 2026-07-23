import { randomUUID } from 'node:crypto';
import { pool, query } from './db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { AllProjectsData, AllProjectsSheet, SheetRow, SheetRowRecord } from './allProjectsTypes';
import { formatHeadingName } from './sheetSync';
import {
  WEBSITE_DELIVERY_PAGE_KEY,
  WEBSITE_DELIVERY_FIELDS,
  EMAIL_FIELD,
} from './websiteDeliveryForm';

// Column order for a freshly created "Deliveries 2" tab: the built-in Email
// field first (every form gets it), then this form's fields in spec order.
//
// The cell key is the field `name`, not its label — several fields legitimately
// share a label (e.g. domain vs hosting both have "Password" / "Username" /
// "Portal URL"), and keying by label would collapse them into one column and
// lose data. Names are unique by construction.
const WEBSITE_DELIVERY_DEFAULT_HEADERS: string[] = [
  EMAIL_FIELD.name,
  ...WEBSITE_DELIVERY_FIELDS.map(f => f.name),
];

// Column order for a freshly created "Live Projects" tab.
//
// A Live Projects row is created by /api/website-delivery-submit, which re-keys
// each submitted field from its machine `name` to its human LABEL before saving
// (see the `project()` helper in that route). So the Live Projects tab is keyed
// by field LABEL, and its default headers must be those same labels — in the
// exact submission order (built-in Email label first, then each field's label in
// spec order) — for the values to land under the right columns instead of the
// sync appending duplicate mismatched columns.
//
// Deriving these from WEBSITE_DELIVERY_FIELDS (the Live Projects document's field
// list) keeps the sheet headers and the form permanently in lock-step: renaming a
// field's label in one place updates the column here too.
const LIVE_PROJECTS_PAGE_KEY = 'live-projects';
const LIVE_PROJECTS_DEFAULT_HEADERS: string[] = [
  EMAIL_FIELD.label,
  ...WEBSITE_DELIVERY_FIELDS.map(f => f.label),
];
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
//                  survives re-syncs. custom_field_values points at that uid.
//                  cells holds the synced values; cells_override holds a user's
//                  edit, merged over cells on read so an edit is not lost at the
//                  next sync.
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
  if (pageKey === 'projects') {
    const hasDead = tabs.some(t => t.sheet_name === 'Dead Projects');
    if (!hasDead) {
      const pos = tabs.length ? Math.max(...tabs.map(t => t.position)) + 1 : 1;
      const defaultHeaders = JSON.stringify([
        'Project name', 'Project Manager', 'Project Scope',
        'Google Drive link (All Availble Scope)', 'Completed', 'Date',
        'Developer', 'Status', 'Last Working day', 'Current Update'
      ]);
      await query(
        "INSERT INTO sheet_tabs (page_key, sheet_name, position, headers, synced_at) VALUES ('projects', 'Dead Projects', ?, ?, ?)",
        [pos, defaultHeaders, Date.now()]
      );
      // Re-fetch tabs after ensuring Dead Projects
      const refreshedTabs = await query<(RowDataPacket & {
        id: number; sheet_name: string; position: number; headers: unknown;
        header_order: unknown; synced_at: number;
      })[]>(
        `SELECT id, sheet_name, position, headers, header_order, synced_at
           FROM sheet_tabs WHERE page_key = ? ORDER BY position ASC, id ASC`,
        [pageKey]
      );
      tabs.length = 0;
      tabs.push(...refreshedTabs);
    }
    await autoMoveDeadProjects();
  }

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
    const formattedSheetName = formatHeadingName(tab.sheet_name);
    sheets.push({ name: formattedSheetName, headers, rows });
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
 * Ensure a tab carries every header in `wanted`, appending any it is missing and
 * returning the tab's resulting header list.
 *
 * This is what lets a data-entry surface write to a column the synced workbook
 * never had (e.g. the credentials popup's Login URL / Username / Password
 * fields, or a brand-new field typed into a row): instead of the value being
 * silently dropped because its header isn't a known column, the column is added
 * to the tab so the value has somewhere to live and shows up in the table.
 *
 * New headers append after the existing ones, preserving column order. Matching
 * is exact by design — headers are the cell keys, so "Password" and "password"
 * are genuinely different columns and we must not merge them.
 */
async function ensureTabHeaders(
  tabId: number, currentHeaders: string[], wanted: string[]
): Promise<string[]> {
  const have = new Set(currentHeaders);
  const missing = wanted.filter(h => h && !have.has(h));
  if (!missing.length) return currentHeaders;
  const next = [...currentHeaders, ...missing];
  await query<ResultSetHeader>(
    'UPDATE sheet_tabs SET headers = ? WHERE id = ?',
    [JSON.stringify(next), tabId]
  );
  return next;
}

async function findOrCreateTab(pageKey: string, sheetName: string) {
  const existing = await findTab(pageKey, sheetName);
  if (existing) return existing;

  // The Website Delivery form owns its column set, so a freshly created tab for
  // it starts with that form's fields (Email first, keyed by name) rather than
  // the projects defaults. The Live Projects tab receives the same submissions
  // re-keyed to their labels, so it uses those labels as its columns — this is
  // what makes the submit/sync line up with the Live Projects document's field
  // names. Any other page keeps the projects-style default.
  const defaultHeaders = pageKey === WEBSITE_DELIVERY_PAGE_KEY
    ? WEBSITE_DELIVERY_DEFAULT_HEADERS
    : pageKey === LIVE_PROJECTS_PAGE_KEY
    ? LIVE_PROJECTS_DEFAULT_HEADERS
    : [
    'Project name', 'Start Date', 'Platform', 'Figma Approval Date', 'Html Approval Date',
    'Cms Approval Date', 'Project Live Date', 'Project Manager', 'Project Scope',
    'Google Drive link (All Available Scope)', 'Developer', 'Status', 'Last Working day',
    'Current Update', 'Domain Name', 'Hosting', 'Hosting Detail', 'Domain', 'SSL Status',
    'Admin Access', 'Editor Access', 'Client Email', 'Client Phone',
    'Start Date of Maintenance', 'End Date of Maintenance', 'Maintenance Duration',
    'Project Category', 'Website Link', 'Login URL', 'Username/ID', 'Password'
  ];

  await query(
    'INSERT INTO sheet_tabs (page_key, sheet_name, position, headers, synced_at) VALUES (?, ?, 1, ?, ?)',
    [pageKey, sheetName, JSON.stringify(defaultHeaders), Date.now()]
  );
  return findTab(pageKey, sheetName);
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

/** Look up which sheet a row lives on. */
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
  const tab = await findOrCreateTab(pageKey, sheetName);
  if (!tab) return null;

  // Any supplied key that isn't yet a column becomes one, so nothing the user
  // typed is thrown away. `headers` then covers every value we're about to save.
  const headers = await ensureTabHeaders(tab.id, tab.headers, Object.keys(cells));

  const clean: SheetRow = {};
  for (const h of headers) clean[h] = typeof cells[h] === 'string' ? cells[h] : '';

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
    tab_id: number; origin: 'sheet' | 'user'; cells: unknown; cells_override: unknown; headers: unknown;
  })[]>(
    `SELECT r.tab_id, r.origin, r.cells, r.cells_override, t.headers
       FROM sheet_rows r JOIN sheet_tabs t ON t.id = r.tab_id
      WHERE r.row_uid = ? AND t.page_key = ? LIMIT 1`,
    [rowUid, pageKey]
  );
  if (!rows.length) return false;
  const row = rows[0];
  const currentHeaders = parseJson(row.headers, []) as string[];

  // Any edited key that isn't yet a column becomes one, so an edit to a field
  // the workbook never had (e.g. Login URL / Password from the credentials
  // popup) is stored and shown instead of silently dropped.
  const headers = await ensureTabHeaders(row.tab_id, currentHeaders, Object.keys(cells));

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
    // The per-row fields feature is gone, but the row_extras table is kept for
    // its historical data. Nothing writes to it now; this only stops a deleted
    // row from leaving rows behind there.
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

function parseDateStr(s: string): Date | null {
  if (!s || typeof s !== 'string') return null;
  const str = s.trim();
  if (!str) return null;

  let m = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (!isNaN(d.getTime())) return d;
  }

  m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    let day = +m[1], month = +m[2], year = +m[3];
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }

  const parsed = Date.parse(str);
  if (!isNaN(parsed)) return new Date(parsed);

  return null;
}

export function parseLastWorkingDayDate(cells: Record<string, string>): Date | null {
  if (!cells) return null;
  const keys = [
    'Last Working day',
    'Last Working Date',
    'Last working day',
    'Last Working Day',
    'Last working date',
    'Last Working day ',
  ];
  for (const k of keys) {
    if (cells[k]) {
      const d = parseDateStr(cells[k]);
      if (d) return d;
    }
  }

  for (const [k, v] of Object.entries(cells)) {
    if (v && /last\s*working/i.test(k)) {
      const d = parseDateStr(String(v));
      if (d) return d;
    }
  }

  return null;
}

/**
 * Auto-move projects in Ongoing Projects (`projects`) that have not been updated
 * for at least one month (determined by Last Working Day) to the Dead Projects tab.
 */
export async function autoMoveDeadProjects(): Promise<void> {
  const tabs = await query<(RowDataPacket & { id: number; sheet_name: string })[]>(
    "SELECT id, sheet_name FROM sheet_tabs WHERE page_key = 'projects'"
  );
  const deadTab = tabs.find(t => t.sheet_name === 'Dead Projects');
  if (!deadTab) return;

  const activeTabs = tabs.filter(t => t.sheet_name !== 'Dead Projects');
  if (!activeTabs.length) return;

  const activeTabIds = activeTabs.map(t => t.id);

  const rows = await query<(RowDataPacket & { row_uid: string; cells: unknown; cells_override: unknown })[]>(
    `SELECT row_uid, cells, cells_override
       FROM sheet_rows
      WHERE tab_id IN (${activeTabIds.map(() => '?').join(',')}) AND hidden = 0`,
    activeTabIds
  );

  const now = new Date();
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const toMove: string[] = [];

  for (const r of rows) {
    const mergedCells: Record<string, string> = {
      ...(parseJson(r.cells, {}) as Record<string, string>),
      ...(parseJson(r.cells_override, {}) as Record<string, string>),
    };

    const lastWorkingDate = parseLastWorkingDayDate(mergedCells);
    if (lastWorkingDate && lastWorkingDate < oneMonthAgo) {
      toMove.push(r.row_uid);
    }
  }

  if (toMove.length > 0) {
    const maxRes = await query<(RowDataPacket & { maxIdx: number })[]>(
      'SELECT COALESCE(MAX(row_index), -1) AS maxIdx FROM sheet_rows WHERE tab_id = ?',
      [deadTab.id]
    );
    let nextIdx = Number(maxRes[0]?.maxIdx ?? -1) + 1;

    for (const uid of toMove) {
      await query(
        'UPDATE sheet_rows SET tab_id = ?, row_index = ? WHERE row_uid = ?',
        [deadTab.id, nextIdx++, uid]
      );
    }
  }
}

