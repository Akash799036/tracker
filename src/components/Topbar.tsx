'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ImportExportDialog from './ImportExportDialog';

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [dialog, setDialog] = useState<null | 'import' | 'export'>(null);
  const router = useRouter();

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
    if (e.key === 'Enter') router.push(`/projects?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="h-16 bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6">
      <button onClick={onMenu} className="lg:hidden p-2 rounded-lg hover:bg-slate-100" aria-label="Menu">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <div className="flex-1 max-w-xl relative">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={onSearch}
          type="text" placeholder="Search projects…"
          className="w-full pl-3 pr-3 h-10 rounded-lg bg-slate-100 border border-transparent focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 outline-none text-sm"/>
      </div>
      <Link href="/project" className="h-10 px-4 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-soft flex items-center gap-1.5">
        <span className="hidden sm:inline">New Project</span>
        <span className="sm:hidden">+</span>
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <button onClick={() => setDialog('import')} className="h-10 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 bg-white">
          <span className="hidden md:inline">Import</span>
          <span className="md:hidden">↑</span>
        </button>
        <button onClick={() => setDialog('export')} className="h-10 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 bg-white">
          <span className="hidden md:inline">Export</span>
          <span className="md:hidden">↓</span>
        </button>
        <button onClick={toggleTheme} className="theme-toggle h-10 w-10 rounded-lg text-slate-700 hover:bg-slate-100 border border-slate-200 bg-white grid place-items-center" aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>

      {dialog && <ImportExportDialog mode={dialog} onClose={() => setDialog(null)} />}
    </header>
  );
}
