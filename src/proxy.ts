import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, hasValidSession } from '@/lib/authEdge';

// Gate the Data & Backup page (and its API surface) behind a valid session.
// Everything else in the app stays public.
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

const PROTECTED_PAGES = ['/settings'];
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
