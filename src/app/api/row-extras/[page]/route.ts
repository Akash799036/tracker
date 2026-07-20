import { NextResponse } from 'next/server';
import { isValidPageKey } from '@/lib/sheetSync';
import { badPage, badRequest, fail, notFound } from '@/lib/apiHelpers';
import { listExtras, addExtra, setExtra, renameExtra, deleteExtra } from '@/lib/rowExtras';
import { listFields } from '@/lib/customFields';
import { getRowContext } from '@/lib/sheetData';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Per-row ad-hoc fields. Every write validates the page key AND that the row
// belongs to that page (inside the rowExtras helpers) — a row uid from another
// page must never be usable here.

/**
 * A label must not collide with a sheet header or an existing sheet-wide custom
 * field: two columns with one name in the same table is ambiguous on screen and
 * in the export.
 */
async function labelConflict(
  pageKey: string, rowUid: string, label: string
): Promise<string | null> {
  const ctx = await getRowContext(rowUid, pageKey);
  if (!ctx) return null;
  const lower = label.trim().toLowerCase();
  if (ctx.headers.some(h => h.trim().toLowerCase() === lower)) {
    return `"${label}" is already a column in this sheet`;
  }
  const fields = await listFields(pageKey, ctx.sheetName);
  if (fields.some(f => f.label.trim().toLowerCase() === lower)) {
    return `"${label}" is already a custom field in this sheet`;
  }
  return null;
}

// GET /api/row-extras/:page?sheet=Name -> { extras: RowExtra[] }
export async function GET(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const sheet = new URL(req.url).searchParams.get('sheet');
    if (!sheet) return badRequest('sheet query param is required');
    return NextResponse.json({ extras: await listExtras(pageKey, sheet) });
  } catch (e) {
    return fail(e);
  }
}

// POST /api/row-extras/:page  { rowUid, label, value }
export async function POST(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const body = await req.json().catch(() => ({}));
    const rowUid = String(body?.rowUid ?? '').trim();
    const label = String(body?.label ?? '').trim();
    const value = String(body?.value ?? '');
    if (!rowUid) return badRequest('rowUid is required');
    if (!label) return badRequest('label is required');

    const conflict = await labelConflict(pageKey, rowUid, label);
    if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });

    // POST creates; changing an existing value is a PATCH.
    const res = await addExtra(pageKey, rowUid, label, value);
    if (!res.ok) {
      if (res.reason === 'invalid-label') return badRequest('label is empty or too long');
      if (res.reason === 'duplicate') {
        return NextResponse.json({ error: 'that field already exists on this row' }, { status: 409 });
      }
      return notFound('row not found on this page');
    }
    return NextResponse.json({ extra: res.extra }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

// PATCH /api/row-extras/:page
//   { rowUid, label, value }              -> set a value
//   { rowUid, oldLabel, newLabel }        -> rename
export async function PATCH(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const body = await req.json().catch(() => ({}));
    const rowUid = String(body?.rowUid ?? '').trim();
    if (!rowUid) return badRequest('rowUid is required');

    const oldLabel = body?.oldLabel == null ? '' : String(body.oldLabel).trim();
    const newLabel = body?.newLabel == null ? '' : String(body.newLabel).trim();

    if (oldLabel && newLabel) {
      const conflict = await labelConflict(pageKey, rowUid, newLabel);
      if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });
      const res = await renameExtra(pageKey, rowUid, oldLabel, newLabel);
      if (!res.ok) {
        if (res.reason === 'invalid-label') return badRequest('label is empty or too long');
        if (res.reason === 'duplicate') {
          return NextResponse.json({ error: 'that field already exists on this row' }, { status: 409 });
        }
        return notFound('field not found on this row');
      }
      return NextResponse.json({ extra: res.extra });
    }

    const label = String(body?.label ?? '').trim();
    if (!label) return badRequest('label (or oldLabel + newLabel) is required');
    const res = await setExtra(pageKey, rowUid, label, String(body?.value ?? ''));
    if (!res.ok) {
      if (res.reason === 'invalid-label') return badRequest('label is empty or too long');
      return notFound('row not found on this page');
    }
    return NextResponse.json({ extra: res.extra });
  } catch (e) {
    return fail(e);
  }
}

// DELETE /api/row-extras/:page?rowUid=..&label=..
export async function DELETE(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const url = new URL(req.url);
    const rowUid = (url.searchParams.get('rowUid') || '').trim();
    const label = (url.searchParams.get('label') || '').trim();
    if (!rowUid || !label) return badRequest('rowUid and label query params are required');
    const ok = await deleteExtra(pageKey, rowUid, label);
    if (!ok) return notFound('field not found on this row');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
