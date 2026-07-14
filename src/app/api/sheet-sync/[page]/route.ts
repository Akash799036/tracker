import { NextResponse } from 'next/server';
import { PAGE_SHEET_IDS, isValidPageKey, type AllProjectsData, type AllProjectsSheet, type SheetRow } from '@/lib/sheetSync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function rowsToSheet(name: string, matrix: string[][]): AllProjectsSheet {
  if (!matrix.length) return { name, headers: [], rows: [] };
  const headers = matrix[0].map((h, i) => (h || '').toString().trim() || `Column ${i + 1}`);
  const rows: SheetRow[] = matrix.slice(1)
    .filter(r => r.some(v => v != null && String(v).trim().length))
    .map(r => {
      const obj: SheetRow = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? '').toString(); });
      return obj;
    });
  return { name, headers, rows };
}

async function fetchWorkbook(sheetId: string): Promise<AllProjectsSheet[]> {
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

export async function GET(req: Request, { params }: { params: { page: string } }) {
  const pageKey = params.page;
  if (!isValidPageKey(pageKey)) {
    return NextResponse.json({ error: `unknown page "${pageKey}"` }, { status: 404 });
  }
  const url = new URL(req.url);
  const sheetId = url.searchParams.get('sheetId') || PAGE_SHEET_IDS[pageKey];
  try {
    const sheets = await fetchWorkbook(sheetId);
    const data: AllProjectsData = {
      sheets,
      syncedAt: Date.now(),
      source: 'google-sheets',
      sourceName: sheetId,
    };
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'sync failed' }, { status: 502 });
  }
}
