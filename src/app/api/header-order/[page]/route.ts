import { NextResponse } from 'next/server';
import { isValidPageKey } from '@/lib/sheetSync';
import { setHeaderOrder } from '@/lib/sheetData';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// PUT /api/header-order/:page  { sheetName, order: string[] }
//
// Stores the user's preferred order for a sheet's built-in (synced) columns.
// There is no GET: the order is already baked into the headers array that
// /api/sheet-sync returns, so the client never needs to fetch it separately.
export async function PUT(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page: pageKey } = await params;
  if (!isValidPageKey(pageKey)) {
    return NextResponse.json({ error: `unknown page "${pageKey}"` }, { status: 404 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const sheetName = String(body?.sheetName ?? '').trim();
    if (!sheetName) {
      return NextResponse.json({ error: 'sheetName is required' }, { status: 400 });
    }
    if (!Array.isArray(body?.order) || body.order.some((h: unknown) => typeof h !== 'string')) {
      return NextResponse.json({ error: 'order must be an array of header names' }, { status: 400 });
    }
    const ok = await setHeaderOrder(pageKey, sheetName, body.order as string[]);
    if (!ok) {
      return NextResponse.json(
        { error: 'sheet not found, or order lists unknown headers' }, { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
