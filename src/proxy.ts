import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, hasValidSession } from '@/lib/authEdge';

// Gate every page and API route that exposes sheet data behind a valid session.
// Only the login flow and the health check stay public.
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

// Every page that renders sheet data. Gating the APIs alone would leave these
// pages loading to a silent blank table — the fetch helpers treat a 401 as
// "keep whatever is on screen" — so redirect to /login instead.
const PROTECTED_PAGES = [
  '/settings',
  '/all-projects',
  '/projects',
  '/live-projects',
  '/priority-list',
  '/marketing',
  '/project',
  '/', // the dashboard aggregates all of the above
];

// The sheet data carries third-party credentials — the workbook has 'Password',
// 'Admin' and 'FTP/Cpanel Creds.' columns, stored verbatim in sheet_rows.cells.
// These routes were public, so `GET /api/sheet-sync/dashboard` with no cookie
// returned 99 of them in cleartext JSON. They are gated now.
//
// /api/sheet-rows and /api/custom-fields also accept POST/PATCH/DELETE, so
// leaving them open allowed anonymous writes as well as anonymous reads.
//
// /api/auth/* and /api/db-health stay public on purpose: gating the login route
// would make signing in impossible.
const PROTECTED_API = [
  '/api/all-projects/upload',
  '/api/all-projects/sync',
  '/api/sheet-sync',
  '/api/sheet-rows',
  '/api/custom-fields',
  '/api/header-order',
];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = await hasValidSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (authed) return NextResponse.next();

  if (PROTECTED_API.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.json({ error: 'authentication required' }, { status: 401 });
  }

  // '/' is exact-match only — treating it as a prefix would match every path,
  // including /login, and send the browser into a redirect loop.
  if (PROTECTED_PAGES.some(p => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`)))) {
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
    '/',
    '/settings',
    '/settings/:path*',
    '/all-projects',
    '/all-projects/:path*',
    '/projects',
    '/projects/:path*',
    '/live-projects',
    '/live-projects/:path*',
    '/priority-list',
    '/priority-list/:path*',
    '/marketing',
    '/marketing/:path*',
    '/project',
    '/project/:path*',
    '/api/all-projects/upload',
    '/api/all-projects/upload/:path*',
    '/api/all-projects/sync',
    '/api/all-projects/sync/:path*',
    // The [page] routes only ever serve `/api/sheet-sync/<page>`, which the
    // bare form does NOT match — the `/:path*` entry is the one doing the work
    // here. Both are listed so a future bare-path handler is covered too.
    '/api/sheet-sync',
    '/api/sheet-sync/:path*',
    '/api/sheet-rows',
    '/api/sheet-rows/:path*',
    '/api/custom-fields',
    '/api/custom-fields/:path*',
    '/api/header-order',
    '/api/header-order/:path*',
  ],
};
