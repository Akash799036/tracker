// Seeder: pull every page's Google Sheet workbook into MySQL so the app no
// longer depends on Google Docs at runtime.
//
//   node scripts/seed-sheets.mjs            # seed all pages
//   node scripts/seed-sheets.mjs marketing  # seed one (or more) pages
//
// Reads DB credentials + optional *_SHEET_ID overrides from .env.local, fetches
// each workbook as xlsx, parses it exactly like the /api/sheet-sync route, and
// reconciles that page's rows in the sheet_tabs / sheet_rows tables.
//
// This is a RECONCILING sync, not a replace: rows are matched to what is already
// stored by natural key so their row_uid survives, and user-added rows
// (origin='user') are never deleted. The storage logic lives in
// scripts/lib/sheetStore.mjs, shared with the app — do not re-implement it here.
//
// Run `npm run migrate` before the first seed after upgrading.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';
import * as XLSX from 'xlsx';
import { ensureTables, syncPageData, sweepOrphanExtras } from './lib/sheetStore.mjs';

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
  'projects':             process.env.PROJECTS_SHEET_ID             || '1ui2V0BA6LDKT_rtX7S4B8TnNtFRtMEKoEBKGrhym5II',
  'live-projects':        process.env.LIVE_PROJECTS_SHEET_ID        || '1gJK-Czm-1uS5XriD3WTwr5mWW2Kp6FnOQnMpc6A6gmM',
  'priority-list':        process.env.PRIORITY_LIST_SHEET_ID        || '1h6QyFLz2q6TVNuTA7DhKvtiDaEONQrIYt8U8SH0dt-s',
  'maintenance-projects': process.env.MAINTENANCE_PROJECTS_SHEET_ID || process.env.MAINTENANCE_SHEET_ID || '1R5xPfKQpnIBskWWNKM81UMD-85hhzEOcll5QEBT8UtE',
  'maintenance':          process.env.MAINTENANCE_SHEET_ID          || '1R5xPfKQpnIBskWWNKM81UMD-85hhzEOcll5QEBT8UtE',
  'marketing':            process.env.MARKETING_SHEET_ID            || '1RWGRBD9mivKY9JAWLCzLK1aR8NMUgxeyVRv06YW3_xs',
  'dashboard':            process.env.DASHBOARD_SHEET_ID            || ALL_PROJECTS_FALLBACK,
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

// Storage lives in scripts/lib/sheetStore.mjs, shared with src/lib/sheetData.ts.

/**
 * Refuse to run against a pre-migration database. Without row_uid the sync
 * cannot match incoming rows to stored ones, so every row would get a fresh
 * identity and every row_extra / custom field value would orphan.
 */
async function assertMigrated(conn) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sheet_rows'
        AND COLUMN_NAME = 'row_uid' LIMIT 1`
  );
  if (!rows.length) {
    console.error('This database predates stable row identity.');
    console.error('Run `npm run migrate` first, then seed again.');
    process.exit(1);
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
  await assertMigrated(conn);
  await ensureTables(conn);

  const syncedAt = Date.now();
  let ok = 0, failed = 0;
  let churnWarnings = 0;
  for (const pageKey of pages) {
    const sheetId = PAGE_SHEET_IDS[pageKey];
    process.stdout.write(`• ${pageKey} … `);
    try {
      const sheets = await fetchWorkbook(sheetId);
      const r = await syncPageData(conn, pageKey, sheets, syncedAt);
      const swept = await sweepOrphanExtras(conn, pageKey);
      console.log(
        `OK — ${r.tabs} tab(s), ${r.rows} rows ` +
        `(${r.matched} matched, ${r.added} new, ${r.removed} removed` +
        `${r.userRows ? `, ${r.userRows} user row(s) kept` : ''}` +
        `${swept ? `, ${swept} orphan extra(s) swept` : ''})`
      );
      // If almost nothing matched on a page that already had rows, natural-key
      // matching has fallen over and user data is orphaning silently.
      if (r.matched > 0 || r.added > 0) {
        const newRatio = r.added / Math.max(1, r.matched + r.added);
        if (r.matched === 0 && r.added > 5) {
          console.log(`  ! every row read as new — row_uids were reassigned`);
          churnWarnings++;
        } else if (newRatio > 0.5 && r.matched > 0) {
          console.log(`  ! ${Math.round(newRatio * 100)}% of rows read as new — check upstream edits`);
          churnWarnings++;
        }
      }
      if (r.byContentHash > 0) {
        console.log(
          `  ${r.byIdentityKey} row(s) keyed by an identity column, ` +
          `${r.byContentHash} by content hash (churn if any cell changes)`
        );
      }
      ok++;
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      failed++;
    }
  }

  await conn.end();
  console.log(`\nDone. ${ok} page(s) seeded${failed ? `, ${failed} failed` : ''}.`);
  if (churnWarnings) {
    console.log(
      `${churnWarnings} page(s) showed high identity churn. Adding a stable ID ` +
      `column to those sheets would let row data survive upstream edits.`
    );
  }
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
