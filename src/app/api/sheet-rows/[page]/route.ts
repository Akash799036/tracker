import { NextResponse } from 'next/server';
import { isValidPageKey } from '@/lib/sheetSync';
import { badPage, badRequest, fail, notFound } from '@/lib/apiHelpers';
import { insertUserRow, updateRowCells, deleteRow, restoreRow } from '@/lib/sheetData';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Coerce a cells payload to strings, ignoring anything that is not one. */
function readCells(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v == null) out[k] = '';
      else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out[k] = String(v);
      }
    }
  }
  return out;
}

// POST /api/sheet-rows/:page  { sheetName, cells } -> 201 { row }
// Adds a user row. The server drops keys that are not headers of that tab and
// fills in any missing ones, so the row always matches the table's shape.
export async function POST(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const body = await req.json().catch(() => ({}));
    const sheetName = String(body?.sheetName ?? '').trim();
    if (!sheetName) return badRequest('sheetName is required');
    const row = await insertUserRow(pageKey, sheetName, readCells(body?.cells));
    if (!row) return notFound(`sheet "${sheetName}" not found on this page`);
    return NextResponse.json({ row }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

// PATCH /api/sheet-rows/:page  { rowUid, cells }   -> edit a row
//                              { rowUid, restore } -> un-hide a synced row
export async function PATCH(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const body = await req.json().catch(() => ({}));
    const rowUid = String(body?.rowUid ?? '').trim();
    if (!rowUid) return badRequest('rowUid is required');

    if (body?.restore === true) {
      const ok = await restoreRow(pageKey, rowUid);
      if (!ok) return notFound('row not found on this page');
      return NextResponse.json({ ok: true });
    }

    const cells = readCells(body?.cells);
    if (!Object.keys(cells).length) return badRequest('cells is required');
    const ok = await updateRowCells(pageKey, rowUid, cells);
    if (!ok) return notFound('row not found on this page');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

// DELETE /api/sheet-rows/:page?uid=...
// A user row is removed outright, along with its extras and field values. A
// synced row is only hidden — deleting it would bring it back at the next sync.
export async function DELETE(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const uid = (new URL(req.url).searchParams.get('uid') || '').trim();
    if (!uid) return badRequest('uid query param is required');
    const ok = await deleteRow(pageKey, uid);
    if (!ok) return notFound('row not found on this page');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
