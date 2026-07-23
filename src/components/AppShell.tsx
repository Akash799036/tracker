'use client';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BackToTop from './BackToTop';
import { useStore } from '@/lib/store';
import { ConfirmProvider } from '@/lib/confirm';
import { ToastProvider } from '@/lib/toast';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { ready } = useStore();
  const [hidden, setHidden] = useState(false);

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
