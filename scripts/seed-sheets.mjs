// Seeder: pull every page's Google Sheet workbook into MySQL so the app no
// longer depends on Google Docs at runtime.
//
//   node scripts/seed-sheets.mjs            # seed all pages
//   node scripts/seed-sheets.mjs marketing  # seed one (or more) pages
//
// Reads DB credentials + optional *_SHEET_ID overrides from .env.local, fetches
// each workbook as xlsx, parses it exactly like the /api/sheet-sync route, and
// replaces that page's rows in the sheet_tabs / sheet_rows tables.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- minimal .env.local loader (no dotenv dependency) ---------------------
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    let raw;
    try { raw = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let [, key, val] = m;
      if (key.startsWith('#')) continue;
      // strip surrounding quotes if present
      val = val.replace(/^["'](.*)["']$/, '$1');
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

// --- sheet ids (mirror of src/lib/sheetSync.ts; env vars override) --------
const ALL_PROJECTS_FALLBACK =
  process.env.ALL_PROJECTS_SHEET_ID || '1F1hcq7Fu3vLcqIt3d0Ns30iz26RjvZRw3lGeDkVhjTM';
const PAGE_SHEET_IDS = {
  'projects':      process.env.PROJECTS_SHEET_ID      || '1ui2V0BA6LDKT_rtX7S4B8TnNtFRtMEKoEBKGrhym5II',
  'live-projects': process.env.LIVE_PROJECTS_SHEET_ID || '1gJK-Czm-1uS5XriD3WTwr5mWW2Kp6FnOQnMpc6A6gmM',
  'priority-list': process.env.PRIORITY_LIST_SHEET_ID || '1h6QyFLz2q6TVNuTA7DhKvtiDaEONQrIYt8U8SH0dt-s',
  'maintenance':   process.env.MAINTENANCE_SHEET_ID   || '1zyzWbQ0mQV7l_WJtMKeZB2tUBzw3Bdu40kUodCRnwXA',
  'marketing':     process.env.MARKETING_SHEET_ID     || '1RWGRBD9mivKY9JAWLCzLK1aR8NMUgxeyVRv06YW3_xs',
  'dashboard':     process.env.DASHBOARD_SHEET_ID     || ALL_PROJECTS_FALLBACK,
};

// --- xlsx parsing (mirror of the sync route) ------------------------------
function rowsToSheet(name, matrix) {
  if (!matrix.length) return { name, headers: [], rows: [] };
  const headers = matrix[0].map((h, i) => (h || '').toString().trim() || `Column ${i + 1}`);
  const rows = matrix.slice(1)
    .filter(r => r.some(v => v != null && String(v).trim().length))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? '').toString(); });
      return obj;
    });
  return { name, headers, rows };
}

async function fetchWorkbook(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  if (!res.ok) {
    throw new Error(
      `Google Sheets export failed (${res.status}). Make sure the sheet is shared as "Anyone with the link: Viewer".`
    );
  }
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    return rowsToSheet(name, matrix);
  });
}

// --- storage (mirror of src/lib/sheetData.ts, plain SQL) ------------------
async function ensureTables(conn) {
  await conn.query(`
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
  await conn.query(`
    CREATE TABLE IF NOT EXISTS sheet_rows (
      tab_id     INT UNSIGNED NOT NULL,
      row_index  INT          NOT NULL,
      cells      JSON         NOT NULL,
      PRIMARY KEY (tab_id, row_index),
      CONSTRAINT fk_sheet_rows_tab FOREIGN KEY (tab_id)
        REFERENCES sheet_tabs (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function replacePageData(conn, pageKey, sheets, syncedAt) {
  await conn.beginTransaction();
  try {
    await conn.execute('DELETE FROM sheet_tabs WHERE page_key = ?', [pageKey]);
    let totalRows = 0;
    for (let pos = 0; pos < sheets.length; pos++) {
      const sheet = sheets[pos];
      const [res] = await conn.execute(
        'INSERT INTO sheet_tabs (page_key, sheet_name, position, headers, synced_at) VALUES (?, ?, ?, ?, ?)',
        [pageKey, sheet.name, pos, JSON.stringify(sheet.headers), syncedAt]
      );
      const tabId = res.insertId;
      const BATCH = 200;
      for (let i = 0; i < sheet.rows.length; i += BATCH) {
        const slice = sheet.rows.slice(i, i + BATCH);
        const placeholders = slice.map(() => '(?, ?, ?)').join(', ');
        const params = [];
        slice.forEach((row, j) => { params.push(tabId, i + j, JSON.stringify(row)); });
        await conn.execute(
          `INSERT INTO sheet_rows (tab_id, row_index, cells) VALUES ${placeholders}`,
          params
        );
      }
      totalRows += sheet.rows.length;
    }
    await conn.commit();
    return totalRows;
  } catch (e) {
    await conn.rollback();
    throw e;
  }
}

// --- main -----------------------------------------------------------------
async function main() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_NAME) {
    console.error('Missing DB config. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env.local');
    process.exit(1);
  }

  const requested = process.argv.slice(2);
  const invalid = requested.filter(k => !(k in PAGE_SHEET_IDS));
  if (invalid.length) {
    console.error(`Unknown page(s): ${invalid.join(', ')}`);
    console.error(`Valid pages: ${Object.keys(PAGE_SHEET_IDS).join(', ')}`);
    process.exit(1);
  }
  const pages = requested.length ? requested : Object.keys(PAGE_SHEET_IDS);

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT ? Number(DB_PORT) : 3306,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: false,
  });

  console.log(`Seeding into ${DB_USER}@${DB_HOST}:${DB_PORT || 3306}/${DB_NAME}`);
  await ensureTables(conn);

  const syncedAt = Date.now();
  let ok = 0, failed = 0;
  for (const pageKey of pages) {
    const sheetId = PAGE_SHEET_IDS[pageKey];
    process.stdout.write(`• ${pageKey} … `);
    try {
      const sheets = await fetchWorkbook(sheetId);
      const rowCount = await replacePageData(conn, pageKey, sheets, syncedAt);
      const tabInfo = sheets.map(s => `${s.name}:${s.rows.length}`).join(', ');
      console.log(`OK — ${sheets.length} tab(s), ${rowCount} rows [${tabInfo}]`);
      ok++;
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      failed++;
    }
  }

  await conn.end();
  console.log(`\nDone. ${ok} page(s) seeded${failed ? `, ${failed} failed` : ''}.`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
