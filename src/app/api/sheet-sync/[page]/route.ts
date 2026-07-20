import { NextResponse } from 'next/server';
import { PAGE_SHEET_IDS, isValidPageKey, type AllProjectsData } from '@/lib/sheetSync';
import type { RawSheet } from '@/lib/allProjectsTypes';
import { getPageData, replacePageData } from '@/lib/sheetData';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
//   GET /api/sheet-sync/:page              -> read stored data from the database
//   GET /api/sheet-sync/:page?refresh=1    -> re-pull from Google, store, then return
//       (optionally with &sheetId=... to override the source workbook)
export async function GET(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) {
    return NextResponse.json({ error: `unknown page "${pageKey}"` }, { status: 404 });
  }

  const url = new URL(req.url);
  const refresh = url.searchParams.get('refresh') === '1' || url.searchParams.get('source') === 'google';

  try {
    if (refresh) {
      const sheetId = url.searchParams.get('sheetId') || PAGE_SHEET_IDS[pageKey];
      const sheets = await fetchWorkbook(sheetId);
      const syncedAt = Date.now();
      await replacePageData(pageKey, sheets, syncedAt);
      // Read back rather than returning what we just parsed: the stored rows
      // carry their row_uid and any user edits, which the raw workbook does not.
      const data = await getPageData(pageKey);
      return NextResponse.json(
        data ?? ({ sheets: [], syncedAt, source: 'google-sheets', sourceName: sheetId } as AllProjectsData)
      );
    }

    const stored = await getPageData(pageKey);
    if (stored) return NextResponse.json(stored);

    // Nothing seeded yet for this page — return an empty-but-valid payload so
    // the UI can render its "not synced" state instead of erroring.
    const empty: AllProjectsData = { sheets: [], syncedAt: 0, source: 'none', sourceName: pageKey };
    return NextResponse.json(empty);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'sync failed' }, { status: 502 });
  }
}
