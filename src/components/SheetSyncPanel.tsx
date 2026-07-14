'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SHEET_SYNC_STORAGE_KEY,
  type AllProjectsData,
  type AllProjectsSheet,
  type SheetSyncPageKey,
} from '@/lib/sheetSync';

function loadCached(key: string): AllProjectsData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AllProjectsData) : null;
  } catch { return null; }
}

function persist(key: string, data: AllProjectsData) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

function fmtTime(ts: number) {
  try { return new Date(ts).toLocaleString(); } catch { return ''; }
}

function looksLikeUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

export default function SheetSyncPanel({
  pageKey,
  title = 'Google Sheet Data',
}: {
  pageKey: SheetSyncPageKey;
  title?: string;
}) {
  const storageKey = SHEET_SYNC_STORAGE_KEY(pageKey);
  const [data, setData] = useState<AllProjectsData | null>(null);
  const [ready, setReady] = useState(false);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dx: number) => {
    scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  };

  useEffect(() => {
    const cached = loadCached(storageKey);
    if (cached) {
      setData(cached);
      setActiveSheet(cached.sheets[0]?.name || '');
    }
    setReady(true);
  }, [storageKey]);

  const runSync = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/sheet-sync/${pageKey}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'sync failed');
      const next = json as AllProjectsData;
      setData(next);
      persist(storageKey, next);
      setActiveSheet(next.sheets[0]?.name || '');
    } catch (e: any) {
      setError(e?.message || 'sync failed');
    } finally {
      setBusy(false);
    }
  }, [pageKey, storageKey]);

  const sheet: AllProjectsSheet | undefined = useMemo(
    () => data?.sheets.find(s => s.name === activeSheet),
    [data, activeSheet]
  );

  const filteredRows = useMemo(() => {
    if (!sheet) return [];
    const q = query.trim().toLowerCase();
    if (!q) return sheet.rows;
    return sheet.rows.filter(r =>
      Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
    );
  }, [sheet, query]);

  if (!ready) return null;

  return (
    <section className="space-y-3 bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {data
              ? <>Synced from Google Sheets · last updated {fmtTime(data.syncedAt)}</>
              : 'Not synced yet. Click the button to pull latest data from this page’s Google Sheet.'}
          </p>
        </div>
        <button
          onClick={runSync}
          disabled={busy}
          className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Syncing…' : 'Sync Data from Google Sheets'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      {data && data.sheets.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 border-b border-slate-200">
            {data.sheets.map(s => (
              <button
                key={s.name}
                onClick={() => setActiveSheet(s.name)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  s.name === activeSheet
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {s.name}
                <span className="ml-2 text-xs text-slate-400">{s.rows.length}</span>
              </button>
            ))}
          </div>

          {sheet && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={`Search in ${sheet.name}…`}
                  className="w-full sm:w-80 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollBy(-400)}
                    aria-label="Scroll left"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollBy(400)}
                    aria-label="Scroll right"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                  <div className="text-xs text-slate-500 whitespace-nowrap">
                    {filteredRows.length} of {sheet.rows.length} rows
                  </div>
                </div>
              </div>

              <div ref={scrollRef} className="overflow-auto border border-slate-200 rounded-xl scroll-smooth">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0">
                    <tr>
                      {sheet.headers.map(h => (
                        <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap border-b border-slate-200">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => (
                      <tr key={i} className="odd:bg-white even:bg-slate-50/40 hover:bg-indigo-50/40">
                        {sheet.headers.map(h => {
                          const v = row[h];
                          return (
                            <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate">
                              {looksLikeUrl(v)
                                ? <a href={v} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline break-all">{v}</a>
                                : (v == null ? '' : String(v))}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={sheet.headers.length || 1} className="px-3 py-6 text-center text-slate-500">
                          No matching rows.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
