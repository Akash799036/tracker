'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/all-projects', label: 'All Projects' },
  { href: '/live-projects', label: 'Live Projects' },
  { href: '/projects', label: 'Ongoing Projects' },
  { href: '/priority-list', label: 'Priority Projects' },
  { href: '/marketing', label: 'Marketing Projects' },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  const isActive = (href: string) => href === '/' ? path === '/' : path.startsWith(href);
  return (
    <>
      <aside className={`fixed z-40 lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 w-64 max-w-[85vw] bg-white/55 backdrop-blur-xl backdrop-saturate-150 border-r border-white/50 flex flex-col transition-transform ${open ? '' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-4 sm:px-6 h-16 flex items-center gap-3 border-b border-white/40">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white font-bold">P</div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900">ProjectTracker</div>
              <div className="text-[11px] text-slate-500 -mt-0.5">Dashboard v1.0 (Next.js)</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1 text-sm overflow-y-auto">
          {NAV.map(n => (
            <Link key={n.href} href={n.href}
              className={`nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-100 ${isActive(n.href) ? 'active' : ''}`}>
              {n.label}
            </Link>
          ))}
          <Link href="/settings"
            className={`nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-100 mt-1 ${path.startsWith('/settings') ? 'active' : ''}`}>
            Data &amp; Backup
          </Link>
        </nav>
      </aside>
      {open && <div onClick={onClose} className="fixed inset-0 bg-black/40 z-30 lg:hidden" />}
    </>
  );
}
