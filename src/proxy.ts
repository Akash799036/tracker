import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, hasValidSession } from '@/lib/authEdge';

// Gate the Data & Backup page (and the endpoints that mutate data) behind a
// valid session. Every other page stays public and readable without logging in.
//
// Read routes are deliberately NOT gated: the project pages must work logged
// out. They instead redact credential columns for anonymous callers — see
// `redactSensitiveCells` in src/lib/sensitiveCells.ts, applied in the
// sheet-sync and all-projects/sync routes. Without that redaction these routes
// served 99 cleartext client passwords to anyone with the URL.
//
// This file MUST live at `src/proxy.ts`. This project uses a `src/` directory,
// so Next.js looks for the convention there — a copy at the repository root is
// silently ignored, with no warning and no error. That failure mode already bit
// this project once: the file sat at the root, the gate never ran, and
// /api/all-projects/upload accepted unauthenticated uploads while /settings
// still appeared to redirect (that redirect came from the page, not from here).
//
// `proxy` replaces the deprecated `middleware` convention in Next.js 16. Both
// still run today, but keeping the deprecated name risks the same silent
// disabling on a future upgrade — and the symptom is an open endpoint, not a
// crash. If you rename or move this file, re-run the unauthenticated checks in
// docs/auth.md.

// Data & Backup only. Everything else is public by design.
const PROTECTED_PAGES = ['/settings'];

// Endpoints that WRITE. Reads stay open so the public pages work logged out,
// but an anonymous caller must not be able to mutate or exfiltrate wholesale:
// /api/sheet-rows, /api/custom-fields and /api/header-order all accept
// POST/PATCH/DELETE, so leaving them open allowed anonymous edits.
//
// The write gate lives in each route handler rather than here, because these
// paths must still serve GET to logged-out visitors — see requireSession() in
// src/lib/apiAuth.ts. Only the upload endpoint, which has no public GET, is
// blocked wholesale at the proxy.
const PROTECTED_API = ['/api/all-projects/upload'];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = await hasValidSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (authed) return NextResponse.next();

  if (PROTECTED_API.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.json({ error: 'authentication required' }, { status: 401 });
  }

  if (PROTECTED_PAGES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Each protected route needs BOTH the bare path and the `/:path*` form.
  // `/api/all-projects/upload/:path*` alone does NOT match the bare
  // `/api/all-projects/upload`, which is the only path that route serves.
  matcher: [
    '/settings',
    '/settings/:path*',
    '/api/all-projects/upload',
    '/api/all-projects/upload/:path*',
  ],
};
