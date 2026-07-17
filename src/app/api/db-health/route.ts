import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Never prerender or collect this at build time — it must run per-request so it
// doesn't try to reach the database while building.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/db-health — quick check that the DB connection is alive.
export async function GET() {
  try {
    const rows = await query<{ version: string; db: string; now: string }[]>(
      'SELECT VERSION() AS version, DATABASE() AS db, NOW() AS now'
    );
    return NextResponse.json({ ok: true, ...rows[0] });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
