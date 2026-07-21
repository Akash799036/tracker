'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Project } from '@/lib/types';
import { avatarStyle, fmtDate, initials, statusPillClass } from '@/lib/ui';
import { useConfirm } from '@/lib/confirm';

export default function ProjectTable({
  projects, onDelete, extraColumns = [],
}: {
  projects: Project[];
  onDelete?: (id: string) => void;
  extraColumns?: { label: string; render: (p: Project) => React.ReactNode }[];
}) {
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const PAGE = 15;

  const requestDelete = async (p: Project) => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Delete this project?',
      message: (
        <>Delete <span className="font-semibold text-slate-800">{p.projectName || 'this project'}</span>? This can&rsquo;t be undone.</>
      ),
      tone: 'danger',
    });
    if (ok) onDelete(p.id);
  };

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim();
    if (!ql) return projects;
    return projects.filter(p =>
      [p.projectName, p.platform, p.projectManager, p.status, p.domainName]
        .join(' ').toLowerCase().includes(ql));
  }, [projects, q]);

  const pageItems = filtered.slice((page - 1) * PAGE, page * PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card">
      <div className="p-4 border-b border-slate-100 flex items-center gap-2 justify-between flex-wrap">
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search…"
          className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm w-full sm:w-64 focus:outline-none focus:border-brand-400" />
        <span className="text-xs text-slate-500">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Project</th>
              <th className="text-left px-4 py-3 font-semibold">Platform</th>
              <th className="text-left px-4 py-3 font-semibold">Manager</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Live</th>
              {extraColumns.map(c => <th key={c.label} className="text-left px-4 py-3 font-semibold">{c.label}</th>)}
              {onDelete && <th className="text-right px-4 py-3 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!pageItems.length && (
              <tr><td colSpan={5 + extraColumns.length + (onDelete ? 1 : 0)} className="p-8 text-center text-slate-500">No projects.</td></tr>
            )}
            {pageItems.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <Link href={`/project?id=${encodeURIComponent(p.id)}`} className="flex items-center gap-3">
                    <div className="avatar" style={{ background: avatarStyle(p.projectName) }}>{initials(p.projectName)}</div>
                    <div className="font-medium text-slate-900">{p.projectName || 'Untitled'}</div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.platform || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{p.projectManager || '—'}</td>
                <td className="px-4 py-3"><span className={statusPillClass(p.status)}>{p.status || 'Not Set'}</span></td>
                <td className="px-4 py-3 text-slate-600">{fmtDate(p.liveDate)}</td>
                {extraColumns.map(c => <td key={c.label} className="px-4 py-3 text-slate-600">{c.render(p)}</td>)}
                {onDelete && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/project?id=${encodeURIComponent(p.id)}`}
                      className="text-indigo-600 hover:text-indigo-700 text-xs font-medium mr-3">Edit</Link>
                    <button onClick={() => requestDelete(p)}
                      className="text-rose-600 hover:text-rose-700 text-xs font-medium">Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="p-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="h-8 px-3 rounded-lg border border-slate-200 text-xs disabled:opacity-40">Prev</button>
          <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="h-8 px-3 rounded-lg border border-slate-200 text-xs disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
