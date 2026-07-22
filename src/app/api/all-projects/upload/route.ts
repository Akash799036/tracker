import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { AllProjectsData, AllProjectsSheet } from '@/lib/allProjectsTypes';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// This route only parses an uploaded file and hands it back — it never writes to
// the database, so these rows have no stored identity. Uids are synthesized so
// the payload still matches the shape the table expects; they last as long as
// the client keeps the parsed result and cannot be used to address stored rows.
function rowsToSheet(name: string, matrix: string[][]): AllProjectsSheet {
  if (!matrix.length) return { name, headers: [], rows: [] };
  const headers = matrix[0].map((h, i) => (h || '').toString().trim() || `Column ${i + 1}`);
  const rows = matrix.slice(1)
    .filter(r => r.some(v => v != null && String(v).trim().length))
    .map(r => {
      const cells: Record<string, string> = {};
      headers.forEach((h, i) => { cells[h] = (r[i] ?? '').toString(); });
      return { uid: randomUUID(), origin: 'sheet' as const, cells };
    });
  return { name, headers, rows };
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;
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
