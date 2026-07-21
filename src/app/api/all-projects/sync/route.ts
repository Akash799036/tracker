import { NextResponse } from 'next/server';
import { ALL_PROJECTS_PAGE_KEY, type AllProjectsData, type RawSheet } from '@/lib/allProjectsTypes';
import { getPageData, replacePageData } from '@/lib/sheetData';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Reading the stored workbook back keeps this route off Google Docs at runtime,
// matching /api/sheet-sync/[page]. ALL_PROJECTS_PAGE_KEY is shared with the page
// component so rows and custom fields stay on the same page key.
const DEFAULT_SHEET_ID = process.env.ALL_PROJECTS_SHEET_ID || '1F1hcq7Fu3vLcqIt3d0Ns30iz26RjvZRw3lGeDkVhjTM';

function rowsToSheet(name: string, matrix: string[][]): RawSheet {
  if (!matrix.length) return { name, headers: [], rows: [] };
  const headers = matrix[0].map((h, i) => (h || '').toString().trim() || `Column ${i + 1}`);
  const rows: Record<string, string>[] = matrix.slice(1)
    .filter(r => r.some(v => v != null && String(v).trim().length))
    .map(r => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? '').toString(); });
      return obj;
    });
  return { name, headers, rows };
}

async function fetchWorkbook(sheetId: string): Promise<RawSheet[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  if (!res.ok) throw new Error(`Google Sheets export failed (${res.status}). Make sure the sheet is shared as "Anyone with the link: Viewer".`);
  const buf = await res.arrayBuffer();
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' }) as string[][];
    return rowsToSheet(name, matrix);
  });
}

// Data is served from MySQL (seeded via `npm run seed`). The app no longer
// depends on Google Docs at runtime.
//
//   GET /api/all-projects/sync            -> read stored data from the database
//   GET /api/all-projects/sync?refresh=1  -> re-pull from Google, store, then return
//       (optionally with &sheetId=... to override the source workbook)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get('refresh') === '1' || url.searchParams.get('source') === 'google';

  // Fully public, unauthenticated route: every caller gets every row, including
  // credential columns. Both return paths go through `serve`.
  const serve = (data: AllProjectsData) => NextResponse.json(data);

  try {
    if (refresh) {
      const sheetId = url.searchParams.get('sheetId') || DEFAULT_SHEET_ID;
      const sheets = await fetchWorkbook(sheetId);
      const syncedAt = Date.now();
      await replacePageData(ALL_PROJECTS_PAGE_KEY, sheets, syncedAt);
      // Read back so the response carries row uids and any user edits.
      const data = await getPageData(ALL_PROJECTS_PAGE_KEY);
      return serve(
        data ?? ({ sheets: [], syncedAt, source: 'google-sheets', sourceName: sheetId } as AllProjectsData)
      );
    }

    const stored = await getPageData(ALL_PROJECTS_PAGE_KEY);
    if (stored) return serve(stored);

    // Nothing seeded yet — return an empty-but-valid payload so the UI can render
    // its "no data" state instead of erroring.
    const empty: AllProjectsData = { sheets: [], syncedAt: 0, source: 'none', sourceName: ALL_PROJECTS_PAGE_KEY };
    return NextResponse.json(empty);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'sync failed' }, { status: 502 });
  }
}
