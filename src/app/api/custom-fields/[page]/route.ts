import { NextResponse } from 'next/server';
import { isValidPageKey } from '@/lib/sheetSync';
import {
  listFields, listValues, addField, deleteField, setValue,
} from '@/lib/customFields';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function badPage(page: string) {
  return NextResponse.json({ error: `unknown page "${page}"` }, { status: 404 });
}

function fail(e: unknown) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : String(e) },
    { status: 500 }
  );
}

// GET /api/custom-fields/:page?sheet=Name
// Returns the custom field definitions (optionally filtered to one sheet) plus
// all stored values, so the client can render extra columns.
export async function GET(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const sheet = new URL(req.url).searchParams.get('sheet') || undefined;
    const fields = await listFields(pageKey, sheet);
    const values = await listValues(fields.map(f => f.id));
    return NextResponse.json({ fields, values });
  } catch (e) {
    return fail(e);
  }
}

// POST /api/custom-fields/:page  { sheetName, label }
export async function POST(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const body = await req.json().catch(() => ({}));
    const sheetName = String(body?.sheetName ?? '').trim();
    const label = String(body?.label ?? '').trim();
    if (!sheetName) return NextResponse.json({ error: 'sheetName is required' }, { status: 400 });
    if (!label) return NextResponse.json({ error: 'label is required' }, { status: 400 });
    const field = await addField(pageKey, sheetName, label);
    return NextResponse.json({ field }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

// PATCH /api/custom-fields/:page  { fieldId, rowUid, value }
export async function PATCH(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const body = await req.json().catch(() => ({}));
    const fieldId = Number(body?.fieldId);
    const rowUid = String(body?.rowUid ?? '').trim();
    const value = String(body?.value ?? '');
    if (!Number.isInteger(fieldId)) {
      return NextResponse.json({ error: 'fieldId must be an integer' }, { status: 400 });
    }
    if (!rowUid) {
      return NextResponse.json({ error: 'rowUid is required' }, { status: 400 });
    }
    const ok = await setValue(pageKey, fieldId, rowUid, value);
    if (!ok) {
      return NextResponse.json({ error: 'field or row not found for this page' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

// DELETE /api/custom-fields/:page?id=123
export async function DELETE(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) return badPage(pageKey);
  try {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
    }
    const ok = await deleteField(id, pageKey);
    if (!ok) return NextResponse.json({ error: 'field not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
