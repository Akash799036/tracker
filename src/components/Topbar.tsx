'use client';
import Link from 'next/link';
import { useGsap } from '@/lib/useGsap';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { useAuth } from '@/lib/useAuth';

// Pages that render a searchable data panel (SheetSyncPanel).
const SEARCHABLE_PAGES = ['/projects', '/live-projects', '/marketing', '/priority-list', '/maintenance-projects'];

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const router = useRouter();
  const pathname = usePathname();
  const headerRef = useGsap('slide', { duration: 0.5 });
  const { user, canEdit, logout, ready: authReady } = useAuth();

  const onLogout = async () => {
    await logout();
    // Leave any edit-only page for the dashboard so the user isn't stranded on
    // a now read-only form.
    router.push('/');
  };

  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem('pt-theme')) as 'light' | 'dark' | null;
    const sys = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const t = stored || (sys ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
    setTheme(t);
  }, []);

  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('pt-theme', t);
    setTheme(t);
  };

  const onSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // Search on the current page if it has a data panel; otherwise fall back to Projects.
    const target = SEARCHABLE_PAGES.includes(pathname) ? pathname : '/projects';
    router.push(`${target}?q=${encodeURIComponent(q)}`);
  };

  return (
    <header ref={headerRef} className="h-16 bg-white/55 backdrop-blur-xl backdrop-saturate-150 border-b border-white/50 sticky top-0 z-20 flex items-center gap-2 sm:gap-3 px-3 sm:px-6">
      <button onClick={toggleTheme} className="theme-toggle order-last shrink-0 h-10 w-10 rounded-lg text-slate-700 hover:bg-slate-100 border border-slate-200 bg-white grid place-items-center" aria-label="Toggle theme">
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      <div className="flex-1 min-w-0 max-w-xl relative">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={onSearch}
          type="text" placeholder="Search projects…"
          className="w-full pl-3 pr-3 h-10 rounded-lg bg-white/40 border border-white/50 focus:border-brand-400 focus:bg-white/80 focus:ring-2 focus:ring-brand-100 outline-none text-sm transition-colors"/>
      </div>
      {/* New Project is an edit action — only offered to signed-in users. */}
      {canEdit && (
        <Link href="/project" className="shrink-0 h-10 px-3 sm:px-4 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-soft flex items-center gap-1.5">
          <span className="hidden sm:inline">New Project</span>
          <span className="sm:hidden text-lg leading-none">+</span>
        </Link>
      )}

      {/* Auth control. Hidden until the initial /api/auth/me check resolves so we
          don't flash "Log in" at an already-authenticated user. */}
      {authReady && (
        user ? (
          <div className="shrink-0 flex items-center gap-2">
            <span className="hidden sm:inline text-[12px] text-slate-600">
              <span className="text-slate-400">Signed in as</span>{' '}
              <span className="font-semibold text-slate-800">{user.username}</span>
            </span>
            <button
              onClick={onLogout}
              className="h-10 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-100 shadow-sm flex items-center gap-1.5"
              title="Log out"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="shrink-0 h-10 px-3 sm:px-4 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-soft flex items-center gap-1.5"
            title="Log in to edit"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            <span className="hidden sm:inline">Log in</span>
          </Link>
        )
      )}
      <div className="ml-auto" />
      <button onClick={onMenu} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 shrink-0" aria-label="Menu">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
    </header>
  );
}
