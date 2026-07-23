// One-time: remove ALL columns/fields from the Live Projects sheet tab(s).
//
//   node scripts/clear-live-projects-fields.mjs          # dry run (default)
//   node scripts/clear-live-projects-fields.mjs --apply  # actually clear
//
// Empties `headers` (and `header_order`) on every sheet_tabs row for
// page_key='live-projects', so the Live Projects page renders a tab with no
// columns. Row data in sheet_rows is left intact — only the column list is
// cleared. A later submission that carries a field will re-add just that column
// (see ensureTabHeaders in src/lib/sheetData.ts).
//
// Safe to re-run: once headers are empty it reports "nothing to clear".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PAGE_KEY = 'live-projects';

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

  console.log(`${apply ? 'CLEARING' : 'DRY RUN'} on ${DB_USER}@${DB_HOST}:${DB_PORT || 3306}/${DB_NAME}\n`);

  const [tabs] = await conn.query(
    `SELECT id, sheet_name, headers FROM sheet_tabs WHERE page_key = ? ORDER BY position ASC, id ASC`,
    [PAGE_KEY]
  );

  if (!tabs.length) {
    console.log(`No tabs for page_key='${PAGE_KEY}'. Nothing to do.`);
    await conn.end();
    return;
  }

  let toClear = 0;
  for (const t of tabs) {
    const h = typeof t.headers === 'string' ? JSON.parse(t.headers || '[]') : (t.headers || []);
    const n = Array.isArray(h) ? h.length : 0;
    console.log(`  id=${t.id} "${t.sheet_name}" — ${n} field(s)${n ? ' -> will clear' : ' (already empty)'}`);
    if (n) toClear++;
  }
  console.log();

  if (!toClear) {
    console.log('All Live Projects tabs already have no fields. Nothing to clear.');
    await conn.end();
    return;
  }

  if (!apply) {
    console.log(`Would clear the fields on ${toClear} tab(s). Re-run with --apply to execute.`);
    await conn.end();
    return;
  }

  await conn.beginTransaction();
  try {
    const [res] = await conn.query(
      `UPDATE sheet_tabs SET headers = '[]', header_order = NULL WHERE page_key = ?`,
      [PAGE_KEY]
    );
    await conn.commit();
    console.log(`Cleared fields on ${res.affectedRows} tab(s). Row data is untouched.`);
  } catch (e) {
    await conn.rollback();
    console.error('Rolled back — no changes made:', e.message);
    await conn.end();
    process.exit(1);
  }

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
