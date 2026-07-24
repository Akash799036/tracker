'use client';
import Link from 'next/link';
import { useGsap } from '@/lib/useGsap';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const router = useRouter();
  const headerRef = useGsap('slide', { duration: 0.5 });
  const { user, logout, ready: authReady } = useAuth();

  const onLogout = async () => {
    await logout();
    // After logout there's no session, so send the user to the login page.
    router.push('/login');
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

  return (
    <header ref={headerRef} className="h-16 bg-white/55 backdrop-blur-xl backdrop-saturate-150 border-b border-white/50 sticky top-0 z-20 flex items-center gap-2 sm:gap-3 px-3 sm:px-6">
      <button onClick={toggleTheme} className="theme-toggle order-last shrink-0 h-10 w-10 rounded-lg text-slate-700 hover:bg-slate-100 border border-slate-200 bg-white grid place-items-center" aria-label="Toggle theme">
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      {/* Auth control. Hidden until the initial /api/auth/me check resolves so we
          don't flash "Log in" at an already-authenticated user. */}
      {authReady && (
        user ? (
          <div className="shrink-0 flex items-center gap-2 ml-auto">
            <span className="hidden sm:inline text-[12px] text-slate-600">
              <span className="text-slate-400">Signed in as</span>{' '}
              <span className="font-semibold text-slate-800">{user.username}</span>
            </span>
            <button
              onClick={onLogout}
              className="shrink-0 h-10 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-100 shadow-sm flex items-center gap-1.5"
              title="Log out"
              aria-label="Log out"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span>Log out</span>
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="shrink-0 h-10 px-3 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-soft flex items-center gap-1.5 ml-auto"
            title="Log in to edit"
            aria-label="Log in to edit"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            <span>Log in</span>
          </Link>
        )
      )}
      <button onClick={onMenu} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 shrink-0" aria-label="Menu">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
    </header>
  );
}
