import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

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
