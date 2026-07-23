import 'server-only';
import { google } from 'googleapis';

// Server-side write-back to a real Google Sheet, authenticated with a Google
// service account. The rest of the app only *reads* from Google (via the public
// XLSX export URL); this is the one place that writes.
//
// Setup (one time):
//   1. In Google Cloud, create a project and enable the "Google Sheets API".
//   2. Create a Service Account; create a JSON key for it.
//   3. Share the target Google Sheet with the service account's email
//      (client_email in the JSON) as an Editor.
//   4. Provide the credentials to the app via env — either:
//        GOOGLE_SERVICE_ACCOUNT_JSON = <the full JSON key, on one line>
//      or the two fields separately:
//        GOOGLE_SERVICE_ACCOUNT_EMAIL = <client_email>
//        GOOGLE_SERVICE_ACCOUNT_KEY   = <private_key, with \n for newlines>
//   5. Set the destination sheet + tab:
//        LIVE_PROJECTS_WRITE_SHEET_ID = <spreadsheet id>   (falls back to
//                                        LIVE_PROJECTS_SHEET_ID)
//        LIVE_PROJECTS_WRITE_TAB      = <tab name>          (default "Live Projects")
//
// Like email, this is best-effort: if it's unconfigured or the call fails, we
// log and return false rather than failing the submission — the row is already
// persisted in our own store by the time we get here.

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/** Build service-account credentials from env, or null if unconfigured. */
function serviceAccountCreds(): { email: string; key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.client_email && parsed.private_key) {
        return { email: parsed.client_email, key: parsed.private_key };
      }
    } catch (e) {
      console.error('[sheets] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
      return null;
    }
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (email && key) {
    // Env stores literal "\n"; the PEM parser needs real newlines.
    key = key.replace(/\\n/g, '\n');
    return { email, key };
  }
  return null;
}

/** The spreadsheet ID we append Live Projects submissions to. */
function liveProjectsSheetId(): string | null {
  return (
    process.env.LIVE_PROJECTS_WRITE_SHEET_ID?.trim() ||
    process.env.LIVE_PROJECTS_SHEET_ID?.trim() ||
    null
  );
}

/** The tab within that spreadsheet. */
function liveProjectsTab(): string {
  return process.env.LIVE_PROJECTS_WRITE_TAB?.trim() || 'Live Projects';
}

function getSheetsClient() {
  const creds = serviceAccountCreds();
  if (!creds) return null;
  const auth = new google.auth.JWT({
    email: creds.email,
    key: creds.key,
    scopes: [SHEETS_SCOPE],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Read the header row (row 1) of the destination tab, so a submission's cells
 * can be positioned under the right columns. Returns [] if the tab is empty or
 * unreadable.
 */
async function readHeaders(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tab: string
): Promise<string[]> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!1:1`,
    });
    const row = res.data.values?.[0] ?? [];
    return row.map(v => String(v ?? '').trim());
  } catch {
    return [];
  }
}

/**
 * Append one submission as a row to the Live Projects Google Sheet.
 *
 * `cells` is keyed by column header. We read the sheet's existing header row and
 * lay the values out under matching columns; any submitted key that isn't yet a
 * column is appended as a new trailing column so nothing is dropped. If the tab
 * has no header row yet, we write one from the submitted keys first.
 *
 * Returns true on success, false if Sheets is unconfigured or the call failed.
 */
export async function appendLiveProjectRow(
  cells: Record<string, string>
): Promise<boolean> {
  const sheets = getSheetsClient();
  if (!sheets) {
    console.warn('[sheets] Google service account not configured; skipping sheet append');
    return false;
  }
  const spreadsheetId = liveProjectsSheetId();
  if (!spreadsheetId) {
    console.warn('[sheets] no LIVE_PROJECTS_WRITE_SHEET_ID / LIVE_PROJECTS_SHEET_ID; skipping sheet append');
    return false;
  }
  const tab = liveProjectsTab();

  try {
    let headers = await readHeaders(sheets, spreadsheetId, tab);
    const submittedKeys = Object.keys(cells);

    // No header row yet: seed it from the submitted keys.
    if (headers.length === 0) {
      headers = submittedKeys;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!1:1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    } else {
      // Append any brand-new columns to the header row so their values have a home.
      const missing = submittedKeys.filter(k => !headers.includes(k));
      if (missing.length) {
        headers = [...headers, ...missing];
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${tab}!1:1`,
          valueInputOption: 'RAW',
          requestBody: { values: [headers] },
        });
      }
    }

    const rowValues = headers.map(h => cells[h] ?? '');
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
    return true;
  } catch (e) {
    console.error('[sheets] append failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Thrown by the strict append path so the API route can surface a clear error. */
export class SheetAppendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetAppendError';
  }
}

/**
 * Strict, spec-faithful append for `POST /api/live-projects`.
 *
 * Differs from `appendLiveProjectRow` (which is best-effort and self-extending):
 *   - The sheet's existing header row is the SOURCE OF TRUTH. Row values are laid
 *     out in exactly the header order; keys with no matching header are ignored.
 *   - It NEVER writes to the header row — append only, so existing rows are never
 *     overwritten and the column layout is never mutated.
 *   - On any problem (unconfigured, no headers, API failure) it THROWS a
 *     `SheetAppendError` instead of returning false, so the caller can fail the
 *     request and report the error to the frontend.
 *
 * Credentials come from `GOOGLE_SERVICE_ACCOUNT_JSON`, the sheet from
 * `LIVE_PROJECTS_WRITE_SHEET_ID`, and the tab from `LIVE_PROJECTS_WRITE_TAB`
 * (per the feature spec). Returns the appended row values on success.
 */
export async function appendLiveProjectRowStrict(
  cells: Record<string, string>
): Promise<string[]> {
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new SheetAppendError(
      'Google Sheets is not configured (set GOOGLE_SERVICE_ACCOUNT_JSON).'
    );
  }
  const spreadsheetId = liveProjectsSheetId();
  if (!spreadsheetId) {
    throw new SheetAppendError(
      'No destination spreadsheet (set LIVE_PROJECTS_WRITE_SHEET_ID).'
    );
  }
  const tab = liveProjectsTab();

  const headers = await readHeaders(sheets, spreadsheetId, tab);
  if (headers.length === 0) {
    throw new SheetAppendError(
      `The "${tab}" tab has no header row to map fields against.`
    );
  }

  // Row values follow the sheet's header order exactly. The header row is left
  // untouched — a submitted key that isn't a header is simply not written.
  const rowValues = headers.map(h => cells[h] ?? '');

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[sheets] strict append failed:', detail);
    throw new SheetAppendError(`Google Sheets append failed: ${detail}`);
  }

  return rowValues;
}
