import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, hasValidSession } from '@/lib/authEdge';

// Gate the Data & Backup page (and its API surface) behind a valid session.
// Everything else in the app stays public.

const PROTECTED_PAGES = ['/settings'];
const PROTECTED_API = ['/api/all-projects/upload'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = await hasValidSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (authed) return NextResponse.next();

  if (PROTECTED_API.some(p => pathname.startsWith(p))) {
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
  matcher: ['/settings/:path*', '/api/all-projects/upload/:path*'],
};
