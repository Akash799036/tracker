import { NextResponse } from 'next/server';
import type { AllProjectsData, AllProjectsSheet, SheetRow } from '@/lib/allProjectsTypes';

export const dynamic = 'force-dynamic';

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

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 });

    const buf = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    const isCSV = /\.csv$/i.test(file.name) || file.type === 'text/csv';

    let sheets: AllProjectsSheet[] = [];
    if (isCSV) {
      const text = new TextDecoder().decode(buf);
      const wb = XLSX.read(text, { type: 'string' });
      const first = wb.SheetNames[0];
      const ws = wb.Sheets[first];
      const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' }) as string[][];
      const sheetName = file.name.replace(/\.csv$/i, '') || 'Sheet1';
      sheets = [rowsToSheet(sheetName, matrix)];
    } else {
      const wb = XLSX.read(buf, { type: 'array' });
      sheets = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name];
        const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' }) as string[][];
        return rowsToSheet(name, matrix);
      });
    }

    const data: AllProjectsData = {
      sheets,
      syncedAt: Date.now(),
      source: 'upload',
      sourceName: file.name,
    };
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'parse failed' }, { status: 400 });
  }
}
