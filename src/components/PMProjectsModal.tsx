'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Modal from './Modal';
import { PALETTE } from './Charts';
import { statusPillClass } from '@/lib/ui';
import type { PMProject, PMProjects } from '@/lib/dashboardAggregate';

/** Deterministic accent per PM — matches the dashboard leaderboard. */
function pmColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string) {
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

const STATUS_KEYS = ['status', 'project status', 'current status', 'stage'];

function pickCell(p: PMProject, candidates: string[]): string {
  const keys = Object.keys(p.cells);
  for (const c of candidates) {
    const hit = keys.find(k => k.trim().toLowerCase() === c) ?? keys.find(k => k.trim().toLowerCase().includes(c));
    if (hit) {
      const v = p.cells[hit];
      const s = v == null ? '' : String(v).trim();
      if (s) return s;
    }
  }
  return '';
}

function looksLikeUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

/** One project: summary line, expandable to every column on the row. */
function ProjectCard({ p }: { p: PMProject }) {
  const [open, setOpen] = useState(false);
  const status = pickCell(p, STATUS_KEYS);

  // Show the sheet's own column order, skipping blanks so the detail view
  // isn't mostly em-dashes.
  const details = useMemo(
    () =>
      p.headers
        .map(h => [h, p.cells[h]] as const)
        .filter(([, v]) => v != null && String(v).trim() !== ''),
    [p]
  );

  return (
    <div className="rounded-xl border border-slate-200 transition-colors hover:border-slate-300">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          ›
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-slate-900">{p.title}</span>
          <span className="mt-0.5 block truncate text-[10.5px] text-slate-500">
            {p.category} · {p.sourceLabel}
          </span>
        </span>
        {status && <span className={`${statusPillClass(status)} shrink-0`}>{status}</span>}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 py-2.5">
          {details.length === 0 ? (
            <p className="text-[11px] italic text-slate-500">No details on this row.</p>
          ) : (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {details.map(([h, v]) => (
                <div key={h} className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">{h}</dt>
                  <dd className="truncate text-[12px] text-slate-800" title={String(v)}>
                    {looksLikeUrl(v) ? (
                      <a
                        href={v}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        {v}
                      </a>
                    ) : (
                      String(v)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-2.5 text-right">
            <Link href={p.href} className="text-[11px] font-semibold text-brand-600 hover:text-brand-700">
              Open in {p.sourceLabel} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

type Props = {
  pm: PMProjects | null;
  onClose: () => void;
};

export default function PMProjectsModal({ pm, onClose }: Props) {
  const [query, setQuery] = useState('');

  // One consolidated list of everything assigned to this PM. Deliberately not
  // grouped by category — each card still names its category, so the source
  // stays visible without fragmenting the list.
  const projects = useMemo(() => {
    if (!pm) return [];
    const q = query.trim().toLowerCase();
    const matched = q
      ? pm.projects.filter(p =>
          // Search the whole row, not just the title — users look for a domain
          // or client name as often as a project name.
          Object.values(p.cells).some(v => v != null && String(v).toLowerCase().includes(q))
        )
      : pm.projects;
    // `collectProjectsByPM` sorts by category first, which reads as arbitrary
    // once the category headings are gone; sort by title instead.
    return [...matched].sort(
      (a, b) => a.title.localeCompare(b.title) || a.category.localeCompare(b.category)
    );
  }, [pm, query]);

  if (!pm) return null;

  const shown = projects.length;
  const color = pmColor(pm.name);

  return (
    <Modal
      title={pm.name}
      subtitle={
        <>
          {pm.total} project{pm.total === 1 ? '' : 's'} assigned
          {query.trim() && <> · {shown} matching</>}
        </>
      }
      onClose={onClose}
    >
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ring-2 ring-white"
            style={{ background: color }}
            aria-hidden="true"
          >
            {initials(pm.name)}
          </span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search these projects…"
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[12.5px] outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div className="px-5 py-4">
        {shown === 0 ? (
          <p className="py-10 text-center text-[11.5px] italic text-slate-500">
            No projects match “{query.trim()}”.
          </p>
        ) : (
          <div className="space-y-1.5">
            {projects.map(p => (
              <ProjectCard key={`${p.href}-${p.uid}`} p={p} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
