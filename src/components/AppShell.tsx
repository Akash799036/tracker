'use client';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BackToTop from './BackToTop';
import { useStore } from '@/lib/store';
import { SHEET_SYNC_DONE_EVENT } from './AutoSheetSync';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { ready } = useStore();
  const [syncDone, setSyncDone] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onDone = () => setSyncDone(true);
    window.addEventListener(SHEET_SYNC_DONE_EVENT, onDone);
    return () => window.removeEventListener(SHEET_SYNC_DONE_EVENT, onDone);
  }, []);

  const done = ready && syncDone;

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setHidden(true), 400);
    return () => clearTimeout(t);
  }, [done]);

  return (
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
  );
}
