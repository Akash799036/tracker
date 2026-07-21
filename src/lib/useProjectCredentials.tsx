'use client';

import { useCallback, useState, type ReactNode } from 'react';
import Modal from '@/components/Modal';
import type { SheetRowRecord } from './allProjectsTypes';

export function useProjectCredentials(headers: string[]) {
  const [activeRow, setActiveRow] = useState<SheetRowRecord | null>(null);

  // We look for headers that likely contain the credentials.
  const getHeaderVal = (row: SheetRowRecord, possibleHeaders: string[]) => {
    for (const h of headers) {
      if (possibleHeaders.includes(h.toLowerCase())) {
        return String(row.cells[h] || '—');
      }
    }
    return '—';
  };

  const renderProjectNameCell = useCallback(
    (row: SheetRowRecord, header: string, value: unknown, fallback: ReactNode): ReactNode => {
      if (header.toLowerCase() !== 'project name' && header.toLowerCase() !== 'project') {
        return fallback;
      }
      return (
        <span className="relative group inline-block max-w-full">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setActiveRow(row); }}
            title="Click Me"
            className="font-semibold text-black underline decoration-slate-400 decoration-dotted underline-offset-2 transition-colors hover:text-slate-700 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded text-left truncate"
          >
            {String(value)}
          </button>
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow-md whitespace-nowrap z-30">
            Click Me
          </span>
        </span>
      );
    },
    []
  );

  const renderUrlField = (val: string) => {
    if (!val || val === '—') return '—';
    const href = /^https?:\/\//i.test(val.trim()) ? val.trim() : `https://${val.trim()}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1 font-medium"
      >
        <span>{val}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-70"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    );
  };

  const credModal = activeRow ? (
    <Modal title={`Credentials for ${String(activeRow.cells[headers.find(h => h.toLowerCase() === 'project name' || h.toLowerCase() === 'project') || ''] || 'Project')}`} onClose={() => setActiveRow(null)} maxWidth="max-w-md">
      <div className="p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Website Link</div>
          <div className="text-sm text-slate-900 bg-slate-50 p-2 rounded border border-slate-200 break-all select-all">
            {renderUrlField(getHeaderVal(activeRow, ['website link', 'website', 'domain name', 'domain', 'url']))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Login URL</div>
          <div className="text-sm text-slate-900 bg-slate-50 p-2 rounded border border-slate-200 break-all select-all">
            {renderUrlField(getHeaderVal(activeRow, ['login url', 'login']))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Username / ID</div>
          <div className="text-sm text-slate-900 bg-slate-50 p-2 rounded border border-slate-200 break-all select-all">
            {getHeaderVal(activeRow, ['username', 'username/id', 'user id', 'username / id'])}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Password</div>
          <div className="text-sm text-slate-900 bg-slate-50 p-2 rounded border border-slate-200 break-all select-all">
            {getHeaderVal(activeRow, ['password', 'pass'])}
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 px-5 py-3 bg-slate-50 flex justify-end">
        <button onClick={() => setActiveRow(null)} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors">
          Close
        </button>
      </div>
    </Modal>
  ) : null;

  return { renderProjectNameCell, credModal };
}
