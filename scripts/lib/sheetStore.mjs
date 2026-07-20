import { randomUUID } from 'node:crypto';
import { naturalKeysForTab } from './rowIdentity.mjs';

// Shared storage layer for the synced sheet data.
//
// This module is the SINGLE implementation of the schema and the reconciling
// sync. Both callers use it:
//
//   • src/lib/sheetData.ts  — the Next app (wraps these functions)
//   • scripts/seed-sheets.mjs — the seeder
//
// It is plain .mjs taking an explicit `conn` so the seeder (which has no build
// step and cannot import .ts) and the app can share it. Earlier the seeder kept a
// hand-copy of the storage logic; the reconciling algorithm below is subtle
// enough that a divergent copy would corrupt data rather than merely go stale.
//
// ---------------------------------------------------------------------------
// Row identity
//
// sheet_rows.row_uid is the stable identity that row_extras and
// custom_field_values point at. It must survive a re-sync, which is what
// syncPageData() below is for: instead of deleting every row and re-inserting
// (which reassigns identity by position and silently re-points user data onto
// the wrong rows), it fingerprints incoming rows via rowIdentity.mjs and carries
// the existing row_uid across on a match.
//
// origin='user' marks rows a person added through the UI. The seeder must never
// delete them — they do not exist upstream and would be destroyed on every sync.
// ---------------------------------------------------------------------------

/** Row indices at/above this belong to user-added rows, keeping them clear of
 *  the seeded 0..n-1 block that gets reassigned on every sync. */
export const USER_ROW_INDEX_BASE = 100000;

const BATCH = 200;

export function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
}

// Every table pins utf8mb4_general_ci explicitly. The original tables were
// created under that collation, but MariaDB 11.4+ defaults new tables to
// utf8mb4_uca1400_ai_ci — and joining row_extras.row_uid to sheet_rows.row_uid
// across two different collations fails with "Illegal mix of collations".
// Pinning keeps new installs and existing databases comparable.
const COLLATE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci';

/**
 * Apply a stored column-order preference to a sheet's live headers.
 *
 * The preference is a list of header names, which may drift from the workbook:
 * a synced column can vanish, and a new one can appear. Reconciling rather than
 * trusting either side outright:
 *   - names in the override that no longer exist are dropped
 *   - names in the workbook that the override never saw are appended, in
 *     workbook order, so a newly synced column shows up at the end instead of
 *     silently disappearing
 *   - a duplicate header name is consumed once, matching the first-wins
 *     behaviour of the name-keyed cell lookup in the table renderers
 *
 * Returns a new array; never mutates either input.
 */
export function applyHeaderOrder(headers, order) {
  if (!Array.isArray(order) || !order.length) return headers;
  const remaining = [...headers];
  const ordered = [];
  for (const name of order) {
    const i = remaining.indexOf(name);
    if (i !== -1) ordered.push(remaining.splice(i, 1)[0]);
  }
  // `remaining` now holds exactly the headers the override didn't mention.
  return [...ordered, ...remaining];
}

export async function ensureTables(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS sheet_tabs (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      page_key    VARCHAR(64)  NOT NULL,
      sheet_name  VARCHAR(255) NOT NULL,
      position    INT          NOT NULL DEFAULT 0,
      headers     JSON         NOT NULL,
      -- A user's preferred column order, as an array of header NAMES. Names, not
      -- indices, so the order survives Google inserting a column mid-sheet. NULL
      -- means "no preference — use the workbook order". Deliberately absent from
      -- the sync upsert below so a re-sync never clobbers it.
      header_order JSON        NULL,
      synced_at   BIGINT       NOT NULL DEFAULT 0,
      updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_page_sheet (page_key, sheet_name)
    ) ${COLLATE}
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS sheet_rows (
      tab_id         INT UNSIGNED NOT NULL,
      row_index      INT          NOT NULL,
      row_uid        CHAR(36)     NULL,
      origin         ENUM('sheet','user') NOT NULL DEFAULT 'sheet',
      sort_key       INT          NOT NULL DEFAULT 0,
      nat_key        CHAR(40)     NULL,
      cells          JSON         NOT NULL,
      cells_override JSON         NULL,
      hidden         TINYINT(1)   NOT NULL DEFAULT 0,
      created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (tab_id, row_index),
      UNIQUE KEY uq_sheet_rows_uid (row_uid),
      KEY idx_sheet_rows_natkey (tab_id, nat_key),
      CONSTRAINT fk_sheet_rows_tab FOREIGN KEY (tab_id)
        REFERENCES sheet_tabs (id) ON DELETE CASCADE
    ) ${COLLATE}
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS row_extras (
      id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
      row_uid    CHAR(36)     NOT NULL,
      page_key   VARCHAR(64)  NOT NULL,
      sheet_name VARCHAR(255) NOT NULL,
      label      VARCHAR(255) NOT NULL,
      value      TEXT         NULL,
      position   INT          NOT NULL DEFAULT 0,
      created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_row_extra (row_uid, label),
      KEY idx_row_extras_page (page_key, sheet_name)
    ) ${COLLATE}
  `);
}

/**
 * Reconcile one page's stored sheets against a freshly fetched workbook.
 *
 * Replaces the old delete-everything-and-reinsert approach. Per tab:
 *   1. Upsert the tab row, preserving its id (and so everything keyed on tab_id).
 *   2. Match incoming rows to stored ones by natural key, carrying row_uid and
 *      any user edits (cells_override) across.
 *   3. Insert genuinely new rows with a fresh row_uid.
 *   4. Delete only the origin='sheet' rows that vanished upstream.
 *   5. Never touch origin='user' rows.
 *
 * Returns a report the seeder prints so identity churn stays visible.
 */
export async function syncPageData(conn, pageKey, sheets, syncedAt) {
  const report = {
    tabs: sheets.length, rows: 0, matched: 0, added: 0, removed: 0,
    userRows: 0, byIdentityKey: 0, byContentHash: 0, tabsKept: 0,
  };

  await conn.beginTransaction();
  try {
    const incomingNames = new Set(sheets.map(s => s.name));

    for (let pos = 0; pos < sheets.length; pos++) {
      const sheet = sheets[pos];
      const headersJson = JSON.stringify(sheet.headers);

      // 1. Upsert the tab, keeping its id so tab_id references survive.
      await conn.execute(
        `INSERT INTO sheet_tabs (page_key, sheet_name, position, headers, synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE position = VALUES(position),
                                 headers = VALUES(headers),
                                 synced_at = VALUES(synced_at)`,
        [pageKey, sheet.name, pos, headersJson, syncedAt]
      );
      const [tabRows] = await conn.execute(
        'SELECT id FROM sheet_tabs WHERE page_key = ? AND sheet_name = ? LIMIT 1',
        [pageKey, sheet.name]
      );
      const tabId = tabRows[0].id;

      // 2. Index what we already have, by natural key.
      const [existing] = await conn.execute(
        `SELECT row_index, row_uid, nat_key, cells_override
           FROM sheet_rows WHERE tab_id = ? AND origin = 'sheet'`,
        [tabId]
      );
      const byNatKey = new Map();
      for (const r of existing) {
        if (r.nat_key && !byNatKey.has(r.nat_key)) byNatKey.set(r.nat_key, r);
      }

      const { keyHeaders, keys } = naturalKeysForTab(sheet.headers, sheet.rows);
      if (keyHeaders) report.byIdentityKey += sheet.rows.length;
      else report.byContentHash += sheet.rows.length;

      // Clear the seeded block so re-indexing cannot collide with itself. User
      // rows live at USER_ROW_INDEX_BASE and above, untouched.
      await conn.execute(
        `DELETE FROM sheet_rows WHERE tab_id = ? AND origin = 'sheet'`,
        [tabId]
      );

      const seen = new Set();
      for (let i = 0; i < sheet.rows.length; i += BATCH) {
        const slice = sheet.rows.slice(i, i + BATCH);
        if (!slice.length) continue;
        const values = [];
        const params = [];
        slice.forEach((row, j) => {
          const idx = i + j;
          const natKey = keys[idx];
          seen.add(natKey);
          const prior = byNatKey.get(natKey);
          if (prior) report.matched++; else report.added++;
          values.push('(?, ?, ?, ?, ?, ?, ?, ?)');
          params.push(
            tabId,
            idx,
            prior?.row_uid || randomUUID(),
            'sheet',
            idx,
            natKey,
            JSON.stringify(row),
            // Carry a user's edit across the sync rather than clobbering it.
            prior?.cells_override == null
              ? null
              : (typeof prior.cells_override === 'string'
                  ? prior.cells_override
                  : JSON.stringify(prior.cells_override))
          );
        });
        await conn.execute(
          `INSERT INTO sheet_rows
             (tab_id, row_index, row_uid, origin, sort_key, nat_key, cells, cells_override)
           VALUES ${values.join(', ')}`,
          params
        );
      }

      for (const natKey of byNatKey.keys()) if (!seen.has(natKey)) report.removed++;
      report.rows += sheet.rows.length;

      const [userCount] = await conn.execute(
        `SELECT COUNT(*) AS n FROM sheet_rows WHERE tab_id = ? AND origin = 'user'`,
        [tabId]
      );
      report.userRows += Number(userCount[0]?.n || 0);
    }

    // Tabs that disappeared upstream: drop their seeded rows, but keep the tab
    // itself (and its user rows) if anyone has added rows to it.
    const [staleTabs] = await conn.execute(
      'SELECT id, sheet_name FROM sheet_tabs WHERE page_key = ?', [pageKey]
    );
    for (const t of staleTabs) {
      if (incomingNames.has(t.sheet_name)) continue;
      const [uc] = await conn.execute(
        `SELECT COUNT(*) AS n FROM sheet_rows WHERE tab_id = ? AND origin = 'user'`, [t.id]
      );
      if (Number(uc[0]?.n || 0) > 0) {
        await conn.execute(
          `DELETE FROM sheet_rows WHERE tab_id = ? AND origin = 'sheet'`, [t.id]
        );
        report.tabsKept++;
      } else {
        await conn.execute('DELETE FROM sheet_tabs WHERE id = ?', [t.id]);
      }
    }

    await conn.commit();
    return report;
  } catch (e) {
    await conn.rollback();
    throw e;
  }
}

/**
 * Delete row_extras whose row_uid no longer exists. row_extras deliberately has
 * no FK to sheet_rows (a cascading delete would wipe extras during a sync), so
 * this sweep is the only thing that collects orphans.
 */
export async function sweepOrphanExtras(conn, pageKey) {
  const [res] = await conn.execute(
    `DELETE e FROM row_extras e
      LEFT JOIN sheet_rows r ON r.row_uid = e.row_uid
      WHERE e.page_key = ? AND r.row_uid IS NULL`,
    [pageKey]
  );
  return res.affectedRows || 0;
}
