// One-time: set the Live Projects tab's fields/columns from the Google Sheet.
//
//   node scripts/set-live-projects-fields-from-sheet.mjs          # dry run
//   node scripts/set-live-projects-fields-from-sheet.mjs --apply  # actually set
//
// Reads the header row of the configured Google Sheet (LIVE_PROJECTS_WRITE_SHEET_ID,
// tab LIVE_PROJECTS_WRITE_TAB) and writes those exact headers, in order, onto the
// sheet_tabs row(s) for page_key='live-projects'. This is what makes the Live
// Projects page show the same fields the Sheet has, so submissions (keyed by
// label) land under the right columns.
//
// Row data in sheet_rows is untouched (cells are keyed by header name, not index).
// Safe to re-run: it just re-asserts the current sheet headers.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';
import { google } from 'googleapis';

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

function serviceAccountCreds() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const p = JSON.parse(raw);
    if (p.client_email && p.private_key) return { email: p.client_email, key: p.private_key };
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (email && key) return { email, key: key.replace(/\\n/g, '\n') };
  return null;
}

async function readSheetHeaders() {
  const creds = serviceAccountCreds();
  if (!creds) throw new Error('Google service account not configured (GOOGLE_SERVICE_ACCOUNT_JSON or _EMAIL/_KEY).');
  const spreadsheetId =
    process.env.LIVE_PROJECTS_WRITE_SHEET_ID?.trim() ||
    process.env.LIVE_PROJECTS_SHEET_ID?.trim();
  if (!spreadsheetId) throw new Error('No LIVE_PROJECTS_WRITE_SHEET_ID / LIVE_PROJECTS_SHEET_ID.');
  const tab = process.env.LIVE_PROJECTS_WRITE_TAB?.trim() || 'Live Projects';

  const auth = new google.auth.JWT({
    email: creds.email, key: creds.key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!1:1` });
  const row = res.data.values?.[0] ?? [];
  return { tab, spreadsheetId, headers: row.map(v => String(v ?? '').trim()).filter(Boolean) };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_NAME) {
    console.error('Missing DB config. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env.local');
    process.exit(1);
  }

  const { tab, headers } = await readSheetHeaders();
  console.log(`Google Sheet tab "${tab}" has ${headers.length} field(s):`);
  console.log('  ' + JSON.stringify(headers) + '\n');
  if (!headers.length) {
    console.error('The Google Sheet header row is empty — refusing to set an empty field list.');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: DB_HOST, port: DB_PORT ? Number(DB_PORT) : 3306,
    user: DB_USER, password: DB_PASSWORD, database: DB_NAME, multipleStatements: false,
  });

  console.log(`${apply ? 'SETTING' : 'DRY RUN'} on ${DB_USER}@${DB_HOST}:${DB_PORT || 3306}/${DB_NAME}\n`);

  const [tabs] = await conn.query(
    `SELECT id, sheet_name, headers FROM sheet_tabs WHERE page_key = ? ORDER BY position ASC, id ASC`,
    [PAGE_KEY]
  );
  if (!tabs.length) {
    console.log(`No tabs for page_key='${PAGE_KEY}'. Nothing to update.`);
    await conn.end();
    return;
  }

  for (const t of tabs) {
    const cur = typeof t.headers === 'string' ? JSON.parse(t.headers || '[]') : (t.headers || []);
    console.log(`  id=${t.id} "${t.sheet_name}" — ${Array.isArray(cur) ? cur.length : 0} field(s) -> ${headers.length}`);
  }
  console.log();

  if (!apply) {
    console.log(`Would set ${headers.length} field(s) on ${tabs.length} tab(s). Re-run with --apply to execute.`);
    await conn.end();
    return;
  }

  await conn.beginTransaction();
  try {
    const [res] = await conn.query(
      `UPDATE sheet_tabs SET headers = ? WHERE page_key = ?`,
      [JSON.stringify(headers), PAGE_KEY]
    );
    await conn.commit();
    console.log(`Set ${headers.length} field(s) on ${res.affectedRows} tab(s). Row data untouched.`);
  } catch (e) {
    await conn.rollback();
    console.error('Rolled back — no changes made:', e.message);
    await conn.end();
    process.exit(1);
  }
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
