'use client';
import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <main className="flex-1 min-w-0 flex flex-col">
        <Topbar onMenu={() => setOpen(true)} />
        <section className="flex-1 p-4 sm:p-6 lg:p-8">{children}</section>
      </main>
    </div>
  );
}
