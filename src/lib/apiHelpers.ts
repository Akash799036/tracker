import { NextResponse } from 'next/server';

// Shared response helpers for the table API routes, so every route reports
// unknown pages and server errors the same way.

export function badPage(page: string) {
  return NextResponse.json({ error: `unknown page "${page}"` }, { status: 404 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function fail(e: unknown) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : String(e) },
    { status: 500 }
  );
}
