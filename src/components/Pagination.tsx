'use client';

import { useEffect, useMemo, useState } from 'react';

export const PAGE_SIZE = 20;

/**
 * Slices a filtered row set into pages of PAGE_SIZE.
 *
 * `resetKey` should carry anything that changes which rows exist (the search
 * query, the active sheet). When it changes the view jumps back to page 1,
 * otherwise a search that narrows the set can strand the user on a page that no
 * longer has rows.
 */
export function usePagination<T>(rows: T[], resetKey: unknown) {
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  // Rows can also shrink under us without resetKey moving — a delete on the
  // last page, say — so clamp rather than render an empty slice.
  const safePage = Math.min(page, totalPages);
  useEffect(() => { if (page !== safePage) setPage(safePage); }, [page, safePage]);

  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage]
  );

  return {
    page: safePage,
    setPage,
    totalPages,
    pageRows,
    from: rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1,
    to: Math.min(safePage * PAGE_SIZE, rows.length),
    total: rows.length,
  };
}

/** Page numbers to show, collapsing long runs to `…` around the current page. */
function pageItems(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const items: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) items.push('…');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < totalPages - 1) items.push('…');
  items.push(totalPages);

  return items;
}

type Props = {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  onPageChange: (p: number) => void;
  /** Noun for the summary line, e.g. "projects". */
  label?: string;
  compact?: boolean;
};

export default function Pagination({
  page, totalPages, from, to, total, onPageChange, label = 'records', compact = false,
}: Props) {
  if (total === 0) return null;

  const btn = compact ? 'h-7 min-w-7 px-2 text-[11px]' : 'h-8 min-w-8 px-2.5 text-xs';
  const base = `${btn} inline-flex items-center justify-center rounded-lg border font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed`;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 px-1 py-3"
    >
      <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-slate-500 tabular-nums`}>
        Showing <span className="font-semibold text-slate-700">{from}–{to}</span> of{' '}
        <span className="font-semibold text-slate-700">{total}</span> {label}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className={`${base} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900`}
          >
            Prev
          </button>

          {pageItems(page, totalPages).map((it, i) =>
            it === '…' ? (
              <span key={`gap-${i}`} className={`${btn} inline-flex items-center justify-center text-slate-400`}>…</span>
            ) : (
              <button
                key={it}
                type="button"
                onClick={() => onPageChange(it)}
                aria-current={it === page ? 'page' : undefined}
                className={
                  it === page
                    ? `${base} border-brand-600 bg-brand-600 text-white`
                    : `${base} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900`
                }
              >
                {it}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className={`${base} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900`}
          >
            Next
          </button>
        </div>
      )}
    </nav>
  );
}
