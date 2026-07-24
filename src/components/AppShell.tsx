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

// Routes a general (not-selected) user is allowed to see. Everything else is the
// selected-users-only internal app. Kept in sync with the public paths in
// middleware.ts (the authoritative gate); this list only drives what chrome to
// show and whether to redirect on the client.
const PUBLIC_PREFIXES = ['/website-delivery-2', '/login'];
const FORM_PATH = '/website-delivery-2';

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { ready } = useStore();
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { ready: authReady, isSelected } = useAuth();

  const publicRoute = isPublicPath(pathname);

  // Client route guard (belt-and-suspenders with middleware): if a general user
  // somehow lands on an internal route, send them to the form. The middleware
  // already blocks the request server-side; this just prevents a flash if the
  // page was reached via client navigation.
  useEffect(() => {
    if (authReady && !isSelected && !publicRoute) {
      router.replace(FORM_PATH);
    }
  }, [authReady, isSelected, publicRoute, router]);

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

  // General users (and any public route) get a bare, chrome-free shell: no
  // sidebar, no topbar, no login button, no data-sync splash — just the form /
  // thank-you (or login). This is what makes the form the only thing a general
  // user can see.
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
