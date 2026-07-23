import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { badRequest, fail } from '@/lib/apiHelpers';
import { insertUserRow } from '@/lib/sheetData';
import { appendLiveProjectRowStrict, SheetAppendError } from '@/lib/googleSheets';

// Live Projects API.
//
// Creating a Live Projects row does two things:
//   1. persists the row in our own store (the `live-projects` page), and
//   2. appends the same row to the real Live Projects Google Sheet.
//
// Per the feature spec, the Google Sheet append is REQUIRED: the sheet's header
// row is the source of truth, values are laid out in header order, existing rows
// are never overwritten (append only), and a Sheet failure fails the request so
// the frontend learns the row did not land. Errors are logged server-side.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Where Live Projects rows live in our own store.
const LIVE_PROJECTS_PAGE_KEY = 'live-projects';
const LIVE_PROJECTS_SHEET_TAB = 'Live Projects';

/** Coerce a cells payload to strings, ignoring anything that is not one. */
function readCells(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        const s = String(v).trim();
        if (s) out[k] = s;
      }
    }
  }
  return out;
}

// POST /api/live-projects  { cells } -> 201 { row, sheetRow }
// Adds a Live Projects row keyed by column label, then appends it to the Google
// Sheet. If the Sheet append fails, the request fails (502) and the error is
// returned to the frontend.
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    // 1. Validate input.
    const body = await req.json().catch(() => ({}));
    const cells = readCells(body?.cells);
    if (!Object.keys(cells).length) return badRequest('cells is required');

    // Persist to our own store first (source of truth for the app's table).
    const row = await insertUserRow(LIVE_PROJECTS_PAGE_KEY, LIVE_PROJECTS_SHEET_TAB, cells);
    if (!row) return fail(new Error('could not save the Live Projects row'));

    // 2-4. Build row values in sheet-header order and append via the Sheets API.
    // A failure here is surfaced to the caller (see catch below).
    const sheetRow = await appendLiveProjectRowStrict(cells);

    return NextResponse.json({ row, sheetRow }, { status: 201 });
  } catch (e) {
    if (e instanceof SheetAppendError) {
      // The row saved to our store but the required Sheet append failed. Report
      // it distinctly so the frontend can tell the user it didn't reach the sheet.
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return fail(e);
  }
}
