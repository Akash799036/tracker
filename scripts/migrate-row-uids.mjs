// Migration: give every sheet row a stable identity.
//
//   node scripts/migrate-row-uids.mjs
//
// Adds row_uid / origin / sort_key / nat_key / cells_override / hidden to
// sheet_rows, creates row_extras, adds custom_field_values.row_uid, then
// backfills all of it from the existing data.
//
// RUN THIS BEFORE THE NEXT `npm run seed`. Until every row has a row_uid, the
// seeder cannot match incoming rows to stored ones and would assign fresh
// identities to everything. seed-sheets.mjs refuses to run without it.
//
// Safe to run repeatedly: every step checks the current schema first.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { naturalKeysForTab } from './lib/rowIdentity.mjs';
import { ensureTables, parseJson } from './lib/sheetStore.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    let raw;
    try { raw = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let [, key, val] = m;
      if (key.startsWith('#')) continue;
      val = val.replace(/^["'](.*)["']$/, '$1');
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

async function hasColumn(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function hasIndex(conn, table, index) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
}

// MySQL and MariaDB disagree on ADD COLUMN IF NOT EXISTS, so check first.
async function addColumn(conn, table, column, ddl) {
  if (await hasColumn(conn, table, column)) return false;
  await conn.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`  + ${table}.${column}`);
  return true;
}

async function addIndex(conn, table, index, ddl) {
  if (await hasIndex(conn, table, index)) return false;
  await conn.query(`ALTER TABLE ${table} ADD ${ddl}`);
  console.log(`  + ${table} index ${index}`);
  return true;
}

/**
 * Force a table to utf8mb4_general_ci.
 *
 * The original tables were created under utf8mb4_general_ci, but MariaDB 11.4+
 * defaults new tables to utf8mb4_uca1400_ai_ci. A row_extras created under the
 * newer default cannot be joined to sheet_rows.row_uid — "Illegal mix of
 * collations". Normalize so both sides always compare.
 */
async function normalizeCollation(conn, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_COLLATION FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  const current = rows[0]?.TABLE_COLLATION;
  if (!current || current === 'utf8mb4_general_ci') return false;
  await conn.query(
    `ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
  );
  console.log(`  ~ ${table}: ${current} -> utf8mb4_general_ci`);
  return true;
}

async function main() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_NAME) {
    console.error('Missing DB config. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env.local');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT ? Number(DB_PORT) : 3306,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: false,
  });

  console.log(`Migrating ${DB_USER}@${DB_HOST}:${DB_PORT || 3306}/${DB_NAME}\n`);

  // Fresh installs get everything from ensureTables(); existing ones need the
  // ALTERs below.
  console.log('Schema:');
  await ensureTables(conn);

  await addColumn(conn, 'sheet_rows', 'row_uid', 'row_uid CHAR(36) NULL AFTER row_index');
  await addColumn(conn, 'sheet_rows', 'origin',
    "origin ENUM('sheet','user') NOT NULL DEFAULT 'sheet' AFTER row_uid");
  await addColumn(conn, 'sheet_rows', 'sort_key', 'sort_key INT NOT NULL DEFAULT 0 AFTER origin');
  await addColumn(conn, 'sheet_rows', 'nat_key', 'nat_key CHAR(40) NULL AFTER sort_key');
  await addColumn(conn, 'sheet_rows', 'cells_override', 'cells_override JSON NULL AFTER cells');
  await addColumn(conn, 'sheet_rows', 'hidden',
    'hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER cells_override');
  await addColumn(conn, 'sheet_rows', 'created_at',
    'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await addColumn(conn, 'sheet_rows', 'updated_at',
    'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await addColumn(conn, 'custom_field_values', 'row_uid', 'row_uid CHAR(36) NULL AFTER row_key');
  await addIndex(conn, 'custom_field_values', 'idx_cfv_row_uid', 'KEY idx_cfv_row_uid (row_uid)');

  for (const t of ['sheet_tabs', 'sheet_rows', 'row_extras', 'custom_fields', 'custom_field_values']) {
    await normalizeCollation(conn, t);
  }

  // Backfill identity per tab. nat_key needs the whole tab at once, since key
  // discovery looks at every row's values.
  console.log('\nBackfilling row identity:');
  const [tabs] = await conn.query(
    'SELECT id, page_key, sheet_name, headers FROM sheet_tabs ORDER BY page_key, position'
  );
  let uidsAssigned = 0, natKeysSet = 0, byIdentity = 0, byHash = 0, totalRows = 0;

  for (const tab of tabs) {
    const headers = parseJson(tab.headers, []);
    const [rows] = await conn.query(
      'SELECT row_index, row_uid, cells FROM sheet_rows WHERE tab_id = ? ORDER BY row_index',
      [tab.id]
    );
    if (!rows.length) continue;
    const cells = rows.map(r => parseJson(r.cells, {}));
    const { keyHeaders, keys } = naturalKeysForTab(headers, cells);
    totalRows += rows.length;
    if (keyHeaders) byIdentity += rows.length; else byHash += rows.length;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const uid = r.row_uid || randomUUID();
      if (!r.row_uid) uidsAssigned++;
      natKeysSet++;
      await conn.execute(
        `UPDATE sheet_rows
            SET row_uid = ?, nat_key = ?, sort_key = ?, origin = 'sheet'
          WHERE tab_id = ? AND row_index = ?`,
        [uid, keys[i], r.row_index, tab.id, r.row_index]
      );
    }
    console.log(
      `  ${tab.page_key}/${tab.sheet_name}: ${rows.length} rows` +
      ` — key: ${keyHeaders ? keyHeaders.join('+') : 'content hash'}`
    );
  }

  // Uniqueness on row_uid can only be enforced once every row has one.
  await addIndex(conn, 'sheet_rows', 'uq_sheet_rows_uid',
    'UNIQUE KEY uq_sheet_rows_uid (row_uid)');

  // Freeze today's positional association between custom field values and rows
  // into a permanent uid reference, before any sync can shift the indices.
  console.log('\nBackfilling custom_field_values.row_uid:');
  const [cfvRes] = await conn.query(
    `UPDATE custom_field_values v
       JOIN custom_fields f ON f.id = v.field_id
       JOIN sheet_tabs t ON t.page_key = f.page_key AND t.sheet_name = f.sheet_name
       JOIN sheet_rows r ON r.tab_id = t.id AND r.row_index = v.row_key
        SET v.row_uid = r.row_uid
      WHERE v.row_uid IS NULL`
  );
  const [orphaned] = await conn.query(
    'SELECT COUNT(*) AS n FROM custom_field_values WHERE row_uid IS NULL'
  );
  console.log(`  mapped ${cfvRes.affectedRows} value(s)`);
  if (Number(orphaned[0].n) > 0) {
    console.log(`  ${orphaned[0].n} value(s) reference a row that no longer exists (left as-is)`);
  }

  console.log('\nSummary:');
  console.log(`  rows:            ${totalRows}`);
  console.log(`  uids assigned:   ${uidsAssigned}`);
  console.log(`  nat_keys set:    ${natKeysSet}`);
  console.log(`  identity-keyed:  ${byIdentity} row(s) — survive upstream edits`);
  console.log(`  content-hashed:  ${byHash} row(s) — identity churns if any cell changes`);
  console.log('\nDone. `npm run seed` is now safe to run.');

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
