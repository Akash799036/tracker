'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BackToTop from './BackToTop';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/useAuth';
import { ConfirmProvider } from '@/lib/confirm';
import { ToastProvider } from '@/lib/toast';

// Standalone routes that render without the dashboard chrome: the login page,
// the Access Denied screen, and the public Live Projects submission form. Kept
// in sync with the public paths in middleware.ts (the authoritative gate); this
// list only drives what chrome to show and whether to redirect on the client.
const PUBLIC_PREFIXES = ['/login', '/access-denied', '/website-delivery-2'];
const LOGIN_PATH = '/login';

// The form page a General User (role 2) is confined to. Mirrors the same
// constant in middleware.ts.
const GENERAL_USER_PAGE = '/website-delivery-2';
const ROLE_GENERAL_USER = 2;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { ready } = useStore();
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { ready: authReady, isSelected, role } = useAuth();

  const publicRoute = isPublicPath(pathname);
  const isGeneralUser = role === ROLE_GENERAL_USER;
  const onGeneralUserPage =
    pathname === GENERAL_USER_PAGE || pathname.startsWith(GENERAL_USER_PAGE + '/');

  // Client route guard (belt-and-suspenders with middleware):
  //  • A signed-out visitor on an internal route → login (carrying ?from=).
  //  • A General User (role 2) anywhere but their form page → back to the form.
  //    The middleware already rewrites such requests to Access Denied server-side;
  //    this just prevents a flash when the page is reached via client navigation.
  useEffect(() => {
    if (!authReady) return;
    if (isGeneralUser) {
      if (!publicRoute && !onGeneralUserPage) router.replace(GENERAL_USER_PAGE);
      return;
    }
    if (!isSelected && !publicRoute) {
      router.replace(`${LOGIN_PATH}?from=${encodeURIComponent(pathname)}`);
    }
  }, [authReady, isSelected, isGeneralUser, onGeneralUserPage, publicRoute, pathname, router]);

  // The intro overlay is only a "the shell is ready to interact with" splash. It
  // dismisses as soon as the local cache has been read — it no longer waits for
  // every page's data to be fetched up front. Each page pulls its own data on
  // demand (with its own PageLoader) when the user navigates to it, so nothing
  // is fetched for pages the user never opens.
  const done = ready;

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setHidden(true), 400);
    return () => clearTimeout(t);
  }, [done]);

  // Standalone routes (login, the public form) get a bare, chrome-free shell: no
  // sidebar, no topbar, no data-sync splash. A signed-out visitor on an internal
  // route also renders chromeless briefly — just long enough to avoid a flash
  // before the guard above redirects them to login.
  const chromeless = publicRoute || (authReady && !isSelected);

  if (chromeless) {
    return (
      <ToastProvider>
        <ConfirmProvider>
          <main className="min-h-screen p-4 sm:p-6 lg:p-8">{children}</main>
        </ConfirmProvider>
      </ToastProvider>
    );
  }

  // While auth is still resolving on an internal route, avoid rendering the full
  // dashboard chrome+content (which could flash before a guard redirect).
  if (!authReady) {
    return <div className="min-h-screen grid place-items-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen">
          <Sidebar open={open} onClose={() => setOpen(false)} />
          <main className="flex-1 min-w-0 flex flex-col">
            <Topbar onMenu={() => setOpen(true)} />
            <section className="flex-1 p-4 sm:p-6 lg:p-8">{children}</section>
          </main>
          <BackToTop />
          {!hidden && (
        <div
          aria-hidden={done}
          role="status"
          className={`fixed inset-0 z-[9999] grid place-items-center bg-white transition-opacity duration-400 ${done ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-14 w-14">
              <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand-600 animate-spin"></div>
            </div>
            <div className="text-sm font-medium text-slate-600">Syncing your data…</div>
          </div>
        </div>
          )}
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
