// One-time cleanup: keep the primary "Live Projects" tab and delete any other
// stray tabs on the Live Projects page.
//
//   node scripts/delete-live-projects-extra-tabs.mjs          # dry run (default)
//   node scripts/delete-live-projects-extra-tabs.mjs --apply  # actually delete
//
// The Live Projects page (page_key='live-projects') renders one UI tab per
// sheet_tabs row. Submissions and syncs can leave extra tabs behind; this keeps
// the single canonical "Live Projects" tab and removes the rest.
//
// Deleting a sheet_tab cascades to its sheet_rows (FK ON DELETE CASCADE). The
// legacy row_extras and custom_field_values tables are keyed by row_uid, not
// FK-linked, so we clear their orphans explicitly before dropping the tabs.
//
// Safe to re-run: once only the main tab remains, it reports "nothing to delete".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PAGE_KEY = 'live-projects';
// The canonical tab to KEEP. formatHeadingName only changes display, not the
// stored sheet_name, so the stored name is exactly this.
const KEEP_TAB = 'Live Projects';

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

async function main() {
  const apply = process.argv.includes('--apply');
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

  console.log(`${apply ? 'DELETING' : 'DRY RUN'} on ${DB_USER}@${DB_HOST}:${DB_PORT || 3306}/${DB_NAME}\n`);

  // Every tab on the Live Projects page, with its row count.
  const [tabs] = await conn.query(
    `SELECT t.id, t.sheet_name, COUNT(r.row_uid) AS rows_count
       FROM sheet_tabs t
       LEFT JOIN sheet_rows r ON r.tab_id = t.id
      WHERE t.page_key = ?
      GROUP BY t.id, t.sheet_name
      ORDER BY t.position ASC, t.id ASC`,
    [PAGE_KEY]
  );

  if (!tabs.length) {
    console.log(`No tabs found for page_key='${PAGE_KEY}'. Nothing to do.`);
    await conn.end();
    return;
  }

  const keep = tabs.filter(t => t.sheet_name === KEEP_TAB);
  const drop = tabs.filter(t => t.sheet_name !== KEEP_TAB);

  console.log('Tabs on the Live Projects page:');
  for (const t of tabs) {
    const mark = t.sheet_name === KEEP_TAB ? 'KEEP' : 'DELETE';
    console.log(`  [${mark}] id=${t.id}  "${t.sheet_name}"  (${t.rows_count} rows)`);
  }
  console.log();

  if (!keep.length) {
    console.error(
      `Refusing to run: no tab named "${KEEP_TAB}" exists, so there is no main ` +
      `tab to keep. Deleting the rest would wipe the page. Check the names above.`
    );
    await conn.end();
    process.exit(1);
  }

  if (!drop.length) {
    console.log('Only the main "Live Projects" tab exists. Nothing to delete.');
    await conn.end();
    return;
  }

  if (!apply) {
    console.log(`Would delete ${drop.length} tab(s) and their rows. Re-run with --apply to execute.`);
    await conn.end();
    return;
  }

  const dropIds = drop.map(t => t.id);
  const placeholders = dropIds.map(() => '?').join(',');

  await conn.beginTransaction();
  try {
    // Collect the row_uids about to be cascade-deleted so we can clear their
    // orphans in the non-FK legacy tables first.
    const [rows] = await conn.query(
      `SELECT row_uid FROM sheet_rows WHERE tab_id IN (${placeholders}) AND row_uid IS NOT NULL`,
      dropIds
    );
    const uids = rows.map(r => r.row_uid);

    if (uids.length) {
      const uidPlaceholders = uids.map(() => '?').join(',');
      await conn.query(`DELETE FROM row_extras WHERE row_uid IN (${uidPlaceholders})`, uids);
      await conn.query(`DELETE FROM custom_field_values WHERE row_uid IN (${uidPlaceholders})`, uids);
    }

    // Deleting the tab cascades to sheet_rows.
    const [res] = await conn.query(
      `DELETE FROM sheet_tabs WHERE id IN (${placeholders})`,
      dropIds
    );

    await conn.commit();
    console.log(
      `\nDeleted ${res.affectedRows} tab(s), ${uids.length} row(s), and their ` +
      `legacy extras. The "Live Projects" tab remains.`
    );
  } catch (e) {
    await conn.rollback();
    console.error('\nRolled back — no changes made:', e.message);
    await conn.end();
    process.exit(1);
  }

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
