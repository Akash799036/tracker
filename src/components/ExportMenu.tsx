'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExportFormat, ExportScope } from '@/lib/sheetExport';

// Export control shared by SheetSyncPanel and All Projects: a dropdown that
// picks the scope (this tab / all tabs) and the format, so the same two choices
// read identically on every page.

export default function ExportMenu({
  onExport,
  activeSheetName,
  sheetCount,
  filteredCount,
  totalCount,
  compact = false,
}: {
  onExport: (format: ExportFormat, scope: ExportScope) => void | Promise<void>;
  activeSheetName?: string;
  /** Number of tabs on the page; the "all tabs" group is hidden when there's 1. */
  sheetCount: number;
  /** Rows the current filter leaves on the active tab. */
  filteredCount: number;
  /** Rows across every tab. */
  totalCount: number;
  /** Slightly smaller type, to match the All Projects toolbar. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, like the other menus on the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (format: ExportFormat, scope: ExportScope) => {
    setBusy(true);
    try {
      await onExport(format, scope);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const text = compact ? 'text-[11px]' : 'text-xs';
  const rowClass =
    'w-full flex items-center justify-between gap-6 px-3 py-1.5 text-left text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-slate-200 bg-white ${text} font-semibold text-slate-700 hover:bg-slate-50 shadow-sm disabled:opacity-60`}
        title="Export this tab or the whole page"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {busy ? 'Exporting…' : 'Export'}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg"
        >
          <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            This tab{activeSheetName ? ` · ${activeSheetName}` : ''}
            <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
              ({filteredCount} {filteredCount === 1 ? 'row' : 'rows'})
            </span>
          </div>
          <button type="button" role="menuitem" disabled={busy} className={rowClass} onClick={() => run('xlsx', 'tab')}>
            <span>Excel</span><span className="text-[10px] text-slate-400">.xlsx</span>
          </button>
          <button type="button" role="menuitem" disabled={busy} className={rowClass} onClick={() => run('csv', 'tab')}>
            <span>CSV</span><span className="text-[10px] text-slate-400">.csv</span>
          </button>

          {sheetCount > 1 && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Entire page · {sheetCount} tabs
                <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
                  ({totalCount} rows)
                </span>
              </div>
              <button type="button" role="menuitem" disabled={busy} className={rowClass} onClick={() => run('xlsx', 'page')}>
                <span>Excel</span><span className="text-[10px] text-slate-400">one tab per sheet</span>
              </button>
              <button type="button" role="menuitem" disabled={busy} className={rowClass} onClick={() => run('csv', 'page')}>
                <span>CSV</span><span className="text-[10px] text-slate-400">combined</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
