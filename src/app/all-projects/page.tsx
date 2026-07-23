'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_PROJECTS_PAGE_KEY,
  ALL_PROJECTS_STORAGE_KEY,
  type AllProjectsData,
  type AllProjectsSheet,
  type SheetRowRecord,
} from '@/lib/allProjectsTypes';
import { formatHeadingName } from '@/lib/sheetSync';
import { exportSheetData, type ExportFormat, type ExportScope } from '@/lib/sheetExport';
import { useSyncedTotal } from '@/lib/useSyncedTotal';
import { useHeaderOrder } from '@/lib/useHeaderOrder';
import { usePMDrilldown } from '@/lib/usePMDrilldown';
import { useProjectCredentials } from '@/lib/useProjectCredentials';
import { useHorizontalScroll } from '@/lib/useHorizontalScroll';
import { ReorderableHeader } from '@/components/ReorderableHeader';
import { SheetCell } from '@/components/SheetCell';
import PageLoader from '@/components/PageLoader';
import { useConfirm } from '@/lib/confirm';
import { useAuth } from '@/lib/useAuth';
import { isDateHeader, toDateInputValue } from '@/lib/dateField';
import { PLATFORM_OPTIONS, PM_OPTIONS, STATUS_OPTIONS, SCOPE_OPTIONS, isPlatformHeader, isPMHeader, isDeveloperHeader, isStatusHeader, isDriveOrScopeHeader, isScopeHeader } from '@/lib/types';
import { FileUploadInput } from '@/components/FileUploadInput';
import { DeveloperMultiSelect } from '@/components/DeveloperMultiSelect';
import { getCleanFileName, getFileUrl, getScopeFileUrl } from '@/lib/ui';
import Pagination, { usePagination } from '@/components/Pagination';
import ExportMenu from '@/components/ExportMenu';

// Rows, edits and deletes all live in the database now (see /api/sheet-rows).
// There is no local override layer: an edit one person makes is an edit everyone
// sees, which is the only behaviour that makes sense once rows are shared.

function loadCached(): AllProjectsData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ALL_PROJECTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AllProjectsData) : null;
  } catch {
    return null;
  }
}

function persist(data: AllProjectsData) {
  try { localStorage.setItem(ALL_PROJECTS_STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function fmtTime(ts: number) {
  try { return new Date(ts).toLocaleString(); } catch { return ''; }
}

function relTime(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function looksLikeUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

export default function AllProjectsPage() {
  const confirm = useConfirm();
  const { canEdit } = useAuth();
  const [data, setData] = useState<AllProjectsData | null>(null);
  const [ready, setReady] = useState(false);
  // Stays true until the very first database fetch settles (success or failure).
  // `ready` alone can't gate the loader here: it flips as soon as the local
  // cache is read, so on a fresh visit the page would flash empty while the
  // (potentially slow) sheet load is still in flight.
  const [loading, setLoading] = useState(true);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'sync' | 'upload' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [rowBusy, setRowBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Also makes a plain mouse wheel scroll the sheet sideways.
  const { ref: scrollRef, scrollBy } = useHorizontalScroll<HTMLDivElement>();

  /** Pull the authoritative rows back after a mutation. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/all-projects/sync', { cache: 'no-store' });
      if (!res.ok) return;
      const fresh = (await res.json()) as AllProjectsData | null;
      if (!fresh?.sheets?.length) return;
      setData(fresh);
      persist(fresh);
      setActiveSheet(prev =>
        fresh.sheets.find(s => s.name === prev) ? prev : fresh.sheets[0]?.name || ''
      );
    } catch { /* keep whatever is on screen */ }
  }, []);

  useEffect(() => {
    // Paint instantly from the browser cache if present, then always refresh
    // from the database so every visitor (incognito or not) sees the full,
    // authoritative row set — not a stale per-browser snapshot.
    const cached = loadCached();
    if (cached) {
      setData(cached);
      setActiveSheet(cached.sheets[0]?.name || '');
    }
    setReady(true);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/all-projects/sync', { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          // The API reports the real reason (e.g. missing DB env vars in
          // production). Surface it instead of silently showing a blank page.
          if (!cancelled) setError(json?.error || `Failed to load data (HTTP ${res.status}).`);
          return;
        }
        const fresh = json as AllProjectsData;
        if (cancelled) return;
        if (!fresh?.sheets?.length) {
          // Connected, but nothing seeded yet — only complain if we had no cache.
          if (!cached) setError('The database has no data yet. Run the seeder (npm run seed).');
          return;
        }
        setError(null);
        setData(fresh);
        persist(fresh);
        setActiveSheet(prev =>
          fresh.sheets.find(s => s.name === prev) ? prev : fresh.sheets[0]?.name || ''
        );
      } catch (e: any) {
        // Network failure reaching our own API. Keep any cache we already showed.
        if (!cancelled && !cached) {
          setError(e?.message || 'Could not reach the server to load data.');
        }
      } finally {
        // The first load has settled — drop the loader whatever the outcome, so
        // errors and empty states get to show through instead of an endless spin.
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const applyData = useCallback((next: AllProjectsData) => {
    setData(next);
    persist(next);
    if (!next.sheets.find(s => s.name === activeSheet)) {
      setActiveSheet(next.sheets[0]?.name || '');
    }
  }, [activeSheet]);

  const runUpload = useCallback(async (file: File) => {
    setBusy('upload'); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/all-projects/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'upload failed');
      applyData(json as AllProjectsData);
    } catch (e: any) {
      setError(e?.message || 'upload failed');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [applyData]);

  const sheet: AllProjectsSheet | undefined = useMemo(
    () => data?.sheets.find(s => s.name === activeSheet),
    [data, activeSheet]
  );

  // Column order for the sheet's own (synced) columns; see useHeaderOrder.
  const EMPTY: string[] = useMemo(() => [], []);
  const { headers, reorderHeaders, orderError } = useHeaderOrder(
    ALL_PROJECTS_PAGE_KEY, activeSheet, sheet?.headers ?? EMPTY
  );

  // Clickable Project Manager cells → drill-down modal.
  const { renderPMCell, pmModal } = usePMDrilldown(headers);
  const { renderProjectNameCell, credModal } = useProjectCredentials(headers, ALL_PROJECTS_PAGE_KEY, refresh);

  const toStr = (v: unknown) => (v == null ? '' : String(v));

  // Search spans the sheet's own cells, so a row is findable by anything visible
  // on it.
  const filteredRows = useMemo(() => {
    const rows = sheet?.rows ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      Object.values(r.cells).some(v => toStr(v).toLowerCase().includes(q))
    );
  }, [sheet, query]);

  // Cap the table at 20 rows; searching or switching sheets returns to page 1.
  const { page, setPage, totalPages, pageRows, from, to } = usePagination(
    filteredRows, `${activeSheet}|${query}`
  );

  const beginEdit = (row: SheetRowRecord) => {
    setEditingUid(row.uid);
    const draft: Record<string, string> = {};
    for (const h of sheet?.headers ?? []) {
      // Date columns seed the picker with normalised ISO so the calendar opens
      // on the stored day even when it was stored in another format.
      draft[h] = isDateHeader(h) ? toDateInputValue(toStr(row.cells[h])) : toStr(row.cells[h]);
    }
    setEditDraft(draft);
  };
  const cancelEdit = () => { setEditingUid(null); setEditDraft({}); };

  const saveEdit = async (row: SheetRowRecord) => {
    if (!sheet) return;
    const diff: Record<string, string> = {};
    for (const h of sheet.headers) {
      const next = editDraft[h] ?? '';
      // Date columns hold normalised ISO in the draft, so compare against the
      // normalised original to avoid a spurious diff (and needless re-save) when
      // the stored value was in another format but the same day.
      const original = isDateHeader(h) ? toDateInputValue(toStr(row.cells[h])) : toStr(row.cells[h]);
      if (original !== next) diff[h] = next;
    }
    if (!Object.keys(diff).length) { cancelEdit(); return; }

    setRowBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheet-rows/${ALL_PROJECTS_PAGE_KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowUid: row.uid, cells: diff }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'could not save that change');
      }
      await refresh();
      cancelEdit();
    } catch (e: any) {
      setError(e?.message || 'could not save that change');
    } finally {
      setRowBusy(false);
    }
  };

  // Save a single cell (one header of one row) from click-to-edit. Unlike
  // saveEdit this never enters a whole-row edit mode; it PATCHes just the one
  // value and refreshes.
  const saveCell = async (row: SheetRowRecord, header: string, next: string) => {
    if (toStr(row.cells[header]) === next) return;
    setError(null);
    try {
      const res = await fetch(`/api/sheet-rows/${ALL_PROJECTS_PAGE_KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowUid: row.uid, cells: { [header]: next } }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'could not save that change');
      }
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'could not save that change');
    }
  };

  const deleteRow = async (row: SheetRowRecord) => {
    const isUser = row.origin === 'user';
    const ok = await confirm({
      title: 'Delete this row?',
      message: isUser
        ? 'This removes it for everyone, along with any fields on it.'
        : 'It came from the source sheet, so it will stay removed until you restore it.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    setError(null);
    try {
      const res = await fetch(
        `/api/sheet-rows/${ALL_PROJECTS_PAGE_KEY}?uid=${encodeURIComponent(row.uid)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'could not delete that row');
      }
      await refresh();
      if (editingUid === row.uid) cancelEdit();
    } catch (e: any) {
      setError(e?.message || 'could not delete that row');
    }
  };

  // Export either the tab on screen (current filter applied) or every tab on
  // the page; see src/lib/sheetExport.ts.
  const exportData = (format: ExportFormat, scope: ExportScope) =>
    exportSheetData({
      format, scope,
      pageKey: ALL_PROJECTS_PAGE_KEY,
      fileprefix: 'all-projects',
      data, sheet, headers, filteredRows,
    });

  const localTotalRows = useMemo(
    () => data?.sheets.reduce((s, x) => s + x.rows.length, 0) || 0,
    [data]
  );
  const syncedTotal = useSyncedTotal('all-projects');
  const totalRows = syncedTotal || localTotalRows;

  // Show the loader until the cache is read, and — when the cache was empty —
  // until the first database fetch settles, so a fresh visit spins rather than
  // flashing an empty page. An error short-circuits it so the message can show.
  if (!ready || (loading && !data && !error)) return <PageLoader />;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-brand-50/40 to-white p-5 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">All Projects</h1>
              {data && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-slate-200 px-2.5 py-1 text-[10.5px] font-medium text-slate-700 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  synced {relTime(data.syncedAt)}
                </span>
              )}
            </div>
            <p className="mt-2 text-[12px] text-slate-600">
              {data
                ? <>Source: <span className="font-semibold text-slate-800">{data.source === 'google-sheets' ? 'Google Sheets' : 'file upload'}</span>
                    {data.sourceName ? <> · <span className="font-mono text-[11px] text-slate-500">{data.sourceName}</span></> : null}
                    <span className="text-slate-400"> · {fmtTime(data.syncedAt)}</span></>
                : 'No data loaded yet. Upload a file to begin.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {/* Uploading replaces the sheet data — an edit action, so it is only
                offered to signed-in users. */}
            {canEdit && (
              <label className="inline-flex h-9 px-3.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 hover:border-slate-300 items-center gap-1.5 shadow-sm cursor-pointer transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {busy === 'upload' ? 'Uploading…' : 'Upload .xlsx / .csv'}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  disabled={busy !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) runUpload(f);
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {(error || orderError) && (
        <div className="rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 to-rose-50/50 px-4 py-3 text-[12px] text-rose-700 flex items-start gap-2 shadow-sm">
          <span className="mt-0.5">⚠️</span>
          <span>{error || orderError}</span>
        </div>
      )}

      {data && data.sheets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MiniStat label="Total rows" value={totalRows} tone="brand" />
          <MiniStat label="Sheets" value={data.sheets.length} tone="violet" />
          <MiniStat label="Active sheet" value={sheet?.rows.length ?? 0} sub={activeSheet} tone="sky" />
        </div>
      )}

      {!data || data.sheets.length === 0 ? (
        <div className="relative overflow-hidden p-10 rounded-2xl border border-dashed border-slate-300 bg-gradient-to-br from-white to-slate-50 text-center shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>
          </div>
          <div className="text-[13px] font-semibold text-slate-800">No sheets loaded yet</div>
          <div className="text-[11.5px] text-slate-500 mt-1">Upload a file to begin.</div>
        </div>
      ) : (
        <>
          {/* overflow-clip, not overflow-hidden: both keep the table's corners
              inside the rounded card, but overflow-hidden makes this a scroll
              container, which pins the toolbar's sticky position to this card
              instead of the viewport and stops it sticking at all. */}
          <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-clip">
            <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-gradient-to-b from-slate-50/60 to-white px-2 pt-2">
              {data.sheets.map(s => (
                <button
                  key={s.name}
                  onClick={() => setActiveSheet(s.name)}
                  className={`inline-flex items-center gap-1.5 px-3 h-8 text-[12px] font-semibold rounded-t-md border-b-2 -mb-px transition-colors ${
                    s.name === activeSheet
                      ? 'border-brand-600 text-brand-700 bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                  }`}
                >
                  {formatHeadingName(s.name)}
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${s.name === activeSheet ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{s.rows.length}</span>
                </button>
              ))}
            </div>

            {sheet && (
              <>
                {/* Sticky so search + scroll arrows stay reachable while the
                    sheet scrolls. top-16 clears the h-16 Topbar; z-10 keeps it
                    under that bar's z-20. Needs an opaque bg or rows show
                    through as they pass beneath. */}
                <div className="sticky top-16 z-10 bg-white p-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder={`Search in ${sheet.name}…`}
                      className="h-9 pl-9 pr-3 w-full sm:max-w-sm lg:w-96 rounded-lg border border-slate-200 bg-white text-[13px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition"
                    />
                  </div>
                  <div className="flex items-center flex-wrap gap-2">
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
                    <div className="text-[10.5px] tabular-nums text-slate-500 whitespace-nowrap">
                      <span className="font-semibold text-slate-700">{filteredRows.length}</span> of {sheet.rows.length}
                    </div>
                    <ExportMenu
                      compact
                      onExport={exportData}
                      activeSheetName={sheet.name}
                      sheetCount={data.sheets.length}
                      filteredCount={filteredRows.length}
                      totalCount={localTotalRows}
                    />
                  </div>
                </div>

                <div ref={scrollRef} className="overflow-auto scroll-smooth">
                  <table className="min-w-full text-[12.5px] text-black">
                    <thead className="bg-slate-50/95 text-black font-bold sticky top-0 backdrop-blur-sm">
                      <tr>
                        {headers.map((h, i) => (
                          <ReorderableHeader
                            key={h}
                            index={i}
                            count={headers.length}
                            group="all-projects-header"
                            label={h}
                            onMove={reorderHeaders}
                            className="text-[10.5px] uppercase tracking-wider py-2.5 text-black font-bold"
                          >
                            {h}
                          </ReorderableHeader>
                        ))}
                        {/* Actions column is edit-only, so it's hidden for
                            signed-out (read-only) users. */}
                        {canEdit && (
                          <th className="text-right text-[10.5px] uppercase tracking-wider font-bold text-black px-3 py-2.5 whitespace-nowrap border-b border-slate-200 sticky right-0 bg-slate-50/95">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map(row => {
                        const isEditing = editingUid === row.uid;
                        return (
                          <tr key={row.uid} className="hover:bg-brand-50/30 transition-colors">
                            {headers.map(h => {
                              const v = row.cells[h];
                              if (isEditing) {
                                if (isScopeHeader(h)) {
                                  return (
                                    <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate text-black">
                                      <select
                                        value={editDraft[h] ?? ''}
                                        onChange={e => setEditDraft(d => ({ ...d, [h]: e.target.value }))}
                                        className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-[12.5px] text-black bg-white"
                                      >
                                        <option value="">Select…</option>
                                        {SCOPE_OPTIONS.map(o => (
                                          <option key={o} value={o}>{o}</option>
                                        ))}
                                        {editDraft[h] && !SCOPE_OPTIONS.includes(editDraft[h]) && (
                                          <option value={editDraft[h]}>{editDraft[h]}</option>
                                        )}
                                      </select>
                                    </td>
                                  );
                                }
                                if (isDriveOrScopeHeader(h)) {
                                  return (
                                    <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] text-black">
                                      <FileUploadInput
                                        value={editDraft[h] ?? ''}
                                        onChange={val => setEditDraft(d => ({ ...d, [h]: val }))}
                                        projectName={String(row.cells['Project name'] || row.cells['Project Name'] || '')}
                                        className="w-full min-w-[12rem] px-2 py-1 rounded border border-slate-300 text-[12.5px] text-black bg-white"
                                      />
                                    </td>
                                  );
                                }
                                if (isPlatformHeader(h)) {
                                  return (
                                    <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate text-black">
                                      <select
                                        value={editDraft[h] ?? ''}
                                        onChange={e => setEditDraft(d => ({ ...d, [h]: e.target.value }))}
                                        className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-[12.5px] text-black bg-white"
                                      >
                                        <option value="">Select Platform…</option>
                                        {PLATFORM_OPTIONS.map(p => (
                                          <option key={p} value={p}>{p}</option>
                                        ))}
                                        {editDraft[h] && !PLATFORM_OPTIONS.includes(editDraft[h]) && (
                                          <option value={editDraft[h]}>{editDraft[h]}</option>
                                        )}
                                      </select>
                                    </td>
                                  );
                                }
                                if (isPMHeader(h)) {
                                  return (
                                    <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate text-black">
                                      <select
                                        value={editDraft[h] ?? ''}
                                        onChange={e => setEditDraft(d => ({ ...d, [h]: e.target.value }))}
                                        className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-[12.5px] text-black bg-white"
                                      >
                                        <option value="">Select PM…</option>
                                        {PM_OPTIONS.map(pm => (
                                          <option key={pm} value={pm}>{pm}</option>
                                        ))}
                                        {editDraft[h] && !PM_OPTIONS.includes(editDraft[h]) && (
                                          <option value={editDraft[h]}>{editDraft[h]}</option>
                                        )}
                                      </select>
                                    </td>
                                  );
                                }
                                if (isDeveloperHeader(h)) {
                                  return (
                                    <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] text-black">
                                      <DeveloperMultiSelect
                                        value={editDraft[h] ?? ''}
                                        onChange={val => setEditDraft(d => ({ ...d, [h]: val }))}
                                        className="w-full min-w-[10rem] px-2 py-1 rounded border border-slate-300 text-[12.5px] text-black bg-white"
                                      />
                                    </td>
                                  );
                                }
                                if (isStatusHeader(h)) {
                                  return (
                                    <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate text-black">
                                      <select
                                        value={editDraft[h] ?? ''}
                                        onChange={e => setEditDraft(d => ({ ...d, [h]: e.target.value }))}
                                        className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-[12.5px] text-black bg-white"
                                      >
                                        <option value="">Select Status…</option>
                                        {STATUS_OPTIONS.map(s => (
                                          <option key={s} value={s}>{s}</option>
                                        ))}
                                        {editDraft[h] && !STATUS_OPTIONS.includes(editDraft[h]) && (
                                          <option value={editDraft[h]}>{editDraft[h]}</option>
                                        )}
                                      </select>
                                    </td>
                                  );
                                }
                                return (
                                  <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate text-black">
                                    <input
                                      type={isDateHeader(h) ? 'date' : 'text'}
                                      value={editDraft[h] ?? ''}
                                      onChange={e => setEditDraft(d => ({ ...d, [h]: e.target.value }))}
                                      className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-[12.5px] text-black"
                                    />
                                  </td>
                                );
                              }
                              const pName = String(row.cells['Project name'] || row.cells['Project Name'] || row.cells['project'] || '').trim();
                              if (isDriveOrScopeHeader(h) && v) {
                                const scopeUrl = getScopeFileUrl(v, pName);
                                const scopeLabel = pName || getCleanFileName(toStr(v));
                                return (
                                  <SheetCell
                                    key={h}
                                    value={toStr(v)}
                                    header={h}
                                    onSave={next => saveCell(row, h, next)}
                                    className="border-b border-slate-100 text-black font-normal"
                                  >
                                    <a href={scopeUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-black underline hover:text-slate-700 font-medium break-all">{scopeLabel}</a>
                                  </SheetCell>
                                );
                              }
                              return (
                                <SheetCell
                                  key={h}
                                  value={toStr(v)}
                                  header={h}
                                  onSave={next => saveCell(row, h, next)}
                                  className="border-b border-slate-100 text-black font-normal"
                                >
                                  {looksLikeUrl(v)
                                    ? <a href={getFileUrl(v)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-black underline hover:text-slate-700 break-all">{getCleanFileName(toStr(v))}</a>
                                    : renderProjectNameCell(row, h, v, renderPMCell(h, v, toStr(v)))}
                                </SheetCell>
                              );
                            })}
                            {canEdit && (
                              <td className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap text-right sticky right-0 bg-white">
                                {isEditing ? (
                                  <>
                                    <button onClick={() => saveEdit(row)} disabled={rowBusy}
                                      className="text-emerald-600 hover:text-emerald-700 text-[11px] font-semibold mr-3 disabled:opacity-50">
                                      {rowBusy ? 'Saving…' : 'Save'}
                                    </button>
                                    <button onClick={cancelEdit}
                                      className="text-slate-500 hover:text-slate-700 text-[11px] font-semibold">Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => beginEdit(row)}
                                      className="text-brand-600 hover:text-brand-700 text-[11px] font-semibold mr-3">Edit</button>
                                    <button onClick={() => deleteRow(row)}
                                      className="text-rose-600 hover:text-rose-700 text-[11px] font-semibold">
                                      Delete
                                    </button>
                                  </>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {addingRow && (
                        <AddRowFormRow
                          headers={headers}
                          trailingCols={customFields.length}
                          busy={rowBusy}
                          onSave={addRow}
                          onCancel={() => setAddingRow(false)}
                          cellClassName="border-b border-slate-100"
                        />
                      )}
                      {filteredRows.length === 0 && !addingRow && (
                        <tr>
                          <td colSpan={(headers.length || 1) + (canEdit ? 1 : 0)} className="px-3 py-10 text-center text-slate-500 italic">
                            {sheet.rows.length === 0 ? 'No rows yet.' : 'No matching rows.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={page}
                  totalPages={totalPages}
                  from={from}
                  to={to}
                  total={filteredRows.length}
                  onPageChange={setPage}
                  label="projects"
                  compact
                />
              </>
            )}
          </section>
        </>
      )}

      {pmModal}
      {credModal}
    </div>
  );
}

type Tone = 'brand' | 'violet' | 'sky';
const TONES: Record<Tone, { grad: string; ring: string; text: string }> = {
  brand:  { grad: 'from-brand-500/10 to-brand-500/0',   ring: 'ring-brand-500/20',  text: 'text-brand-700' },
  violet: { grad: 'from-violet-500/10 to-violet-500/0', ring: 'ring-violet-500/20', text: 'text-violet-700' },
  sky:    { grad: 'from-sky-500/10 to-sky-500/0',       ring: 'ring-sky-500/20',    text: 'text-sky-700' },
};

function MiniStat({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone: Tone }) {
  const t = TONES[tone];
  return (
    <div className={`relative overflow-hidden rounded-xl bg-white border border-slate-200/70 ring-1 ${t.ring} px-4 py-3 shadow-sm`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${t.grad} opacity-60 pointer-events-none`} />
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`mt-1 text-[24px] font-bold tabular-nums leading-none ${t.text}`}>{value}</div>
        {sub && <div className="mt-1.5 text-[11px] text-slate-500 truncate">{sub}</div>}
      </div>
    </div>
  );
}
