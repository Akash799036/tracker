import { NextResponse } from 'next/server';
import { isValidPageKey } from '@/lib/sheetSync';
import { badPage, badRequest, fail, notFound } from '@/lib/apiHelpers';
import { insertUserRow, updateRowCells, deleteRow, restoreRow } from '@/lib/sheetData';
import { requireAuth } from '@/lib/auth';
import { encryptField } from '@/lib/fieldCrypto';
import {
  WEBSITE_DELIVERY_PAGE_KEY,
  WEBSITE_DELIVERY_FIELDS,
} from '@/lib/websiteDeliveryForm';

// Names of the encrypted fields on the Website Delivery form, keyed by the cell
// key they're stored under (the field `name`).
const WEBSITE_DELIVERY_ENC_KEYS = new Set(
  WEBSITE_DELIVERY_FIELDS.filter(f => f.encrypted).map(f => f.name)
);

/**
 * Encrypt at rest the values of any encrypted field for the Website Delivery
 * page. Non-encrypted pages and non-encrypted keys pass through unchanged.
 *
 * When `blankToKeep` is set (edits), an empty value for an encrypted field is
 * DROPPED rather than stored — so leaving a password box blank keeps the existing
 * secret instead of wiping it. On insert there is nothing to keep, so a blank
 * stays blank.
 */
function applyFieldEncryption(
  pageKey: string,
  cells: Record<string, string>,
  blankToKeep: boolean
): Record<string, string> {
  if (pageKey !== WEBSITE_DELIVERY_PAGE_KEY) return cells;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cells)) {
    if (!WEBSITE_DELIVERY_ENC_KEYS.has(k)) {
      out[k] = v;
      continue;
    }
    if (v === '' || v == null) {
      if (blankToKeep) continue; // keep the stored secret; don't overwrite with blank
      out[k] = '';
      continue;
    }
    out[k] = encryptField(v);
  }
  return out;
}

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
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const body = await req.json().catch(() => ({}));
    const sheetName = String(body?.sheetName ?? '').trim();
    if (!sheetName) return badRequest('sheetName is required');
    const cells = applyFieldEncryption(pageKey, readCells(body?.cells), false);
    const row = await insertUserRow(pageKey, sheetName, cells);
    if (!row) return notFound(`sheet "${sheetName}" not found on this page`);
    return NextResponse.json({ row }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

// PATCH /api/sheet-rows/:page  { rowUid, cells }   -> edit a row
//                              { rowUid, restore } -> un-hide a synced row
export async function PATCH(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;
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

    const rawCells = readCells(body?.cells);
    if (!Object.keys(rawCells).length) return badRequest('cells is required');
    // blank-to-keep on edit: an emptied encrypted field keeps its stored secret.
    const cells = applyFieldEncryption(pageKey, rawCells, true);
    if (!Object.keys(cells).length) return NextResponse.json({ ok: true });
    const ok = await updateRowCells(pageKey, rowUid, cells);
    if (!ok) return notFound('row not found on this page');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

// DELETE /api/sheet-rows/:page?uid=...
// A user row is removed outright, along with its field values. A
// synced row is only hidden — deleting it would bring it back at the next sync.
export async function DELETE(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;
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
