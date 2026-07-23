'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  SHEET_SYNC_STORAGE_KEY,
  formatHeadingName,
  type AllProjectsData,
  type AllProjectsSheet,
  type SheetRowRecord,
  type SheetSyncPageKey,
} from '@/lib/sheetSync';
import { exportSheetData, type ExportFormat, type ExportScope } from '@/lib/sheetExport';
import { useConfirm } from '@/lib/confirm';
import { useAuth } from '@/lib/useAuth';
import { isDateHeader, toDateInputValue } from '@/lib/dateField';
import { useHeaderOrder } from '@/lib/useHeaderOrder';
import { usePMDrilldown } from '@/lib/usePMDrilldown';
import { useProjectCredentials } from '@/lib/useProjectCredentials';
import { useHorizontalScroll } from '@/lib/useHorizontalScroll';
import { PLATFORM_OPTIONS, PM_OPTIONS, STATUS_OPTIONS, SCOPE_OPTIONS, COMPLETED_OPTIONS, isPlatformHeader, isPMHeader, isDeveloperHeader, isStatusHeader, isCompletedHeader, isDriveOrScopeHeader, isScopeHeader } from '@/lib/types';
import { FileUploadInput } from './FileUploadInput';
import { DeveloperMultiSelect } from './DeveloperMultiSelect';
import { getCleanFileName, getFileUrl, getScopeFileUrl } from '@/lib/ui';
import { ReorderableHeader } from './ReorderableHeader';
import { SheetCell } from './SheetCell';
import PageLoader from './PageLoader';
import Pagination, { usePagination } from './Pagination';
import ExportMenu from './ExportMenu';

// Rows, edits and deletes all live in the database now (see /api/sheet-rows).
// There is no local override layer: an edit one person makes is an edit everyone
// sees, which is the only behaviour that makes sense once rows are shared.

function loadCached(key: string): AllProjectsData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AllProjectsData) : null;
  } catch { return null; }
}

function fmtTime(ts: number) {
  try { return new Date(ts).toLocaleString(); } catch { return ''; }
}

function looksLikeUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

// Columns hidden from a page's display without deleting the underlying data.
// The values stay in the database (and reappear if a hide is removed); they are
// simply not rendered as columns here, and — since an export mirrors what's on
// screen — are left out of this page's exports too. Matched case/space-
// insensitively so a re-sync that reflows a header ("Start  Date of
// Maintenance") still hides it. Keyed by pageKey so the same shared panel can
// drop different columns per page.
const HIDDEN_COLUMNS: Partial<Record<SheetSyncPageKey, string[]>> = {
  // Ongoing Projects: hide the maintenance start/end/duration columns.
  projects: ['Start Date of Maintenance', 'End Date of Maintenance', 'Maintenance Duration'],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function SheetSyncPanelInner({
  pageKey,
  title = 'Project Data',
}: {
  pageKey: SheetSyncPageKey;
  title?: string;
}) {
  const storageKey = SHEET_SYNC_STORAGE_KEY(pageKey);
  const searchParams = useSearchParams();
  const router = useRouter();
  const confirm = useConfirm();
  const { canEdit } = useAuth();

  // On the Live Projects page, "add a project" means opening the full Website
  // Delivery form rather than dropping a blank inline row into the sheet. Other
  // sheet pages keep the quick inline-add.
  const addOpensForm = pageKey === 'live-projects';
  const [data, setData] = useState<AllProjectsData | null>(null);
  const [ready, setReady] = useState(false);
  // Stays true until the first API pull settles, so a fresh visit shows a loader
  // instead of the "No data loaded yet" empty state while rows are on the way.
  const [loading, setLoading] = useState(true);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [rowBusy, setRowBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const toStr = (v: unknown) => (v == null ? '' : String(v));
  // Also makes a plain mouse wheel scroll the sheet sideways.
  const { ref: scrollRef, scrollBy } = useHorizontalScroll<HTMLDivElement>();

  /** Pull the authoritative rows from the API. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/sheet-sync/${pageKey}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as AllProjectsData | null;
      if (json && json.sheets?.length) {
        setData(json);
        setActiveSheet(prev =>
          prev && json.sheets.some(s => s.name === prev) ? prev : (json.sheets[0]?.name || '')
        );
        try {
          localStorage.setItem(storageKey, JSON.stringify(json));
          // Tell same-tab listeners (PM drill-down index, useSyncedTotal) that
          // this page's cache changed — a 'storage' event only fires cross-tab.
          window.dispatchEvent(new CustomEvent('sheet-sync:updated', { detail: { pageKey } }));
        } catch {}
      }
    } catch { /* keep whatever is on screen */ }
  }, [pageKey, storageKey]);

  /**
   * Manually re-pull the page's Google Sheet. Unlike `refresh` (which reads the
   * stored rows), this hits `?refresh=1`, so the server re-fetches the source
   * workbook, reconciles it into the database — preserving row identity and any
   * user edits — and returns the merged result. This is how an edit made
   * directly in the Google Sheet is reflected on the page.
   */
  const syncFromGoogle = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheet-sync/${pageKey}?refresh=1`, { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as AllProjectsData | { error?: string } | null;
      if (!res.ok) {
        throw new Error((json as { error?: string })?.error || 'could not sync from Google Sheets');
      }
      const data = json as AllProjectsData | null;
      if (data && data.sheets?.length) {
        setData(data);
        setActiveSheet(prev =>
          prev && data.sheets.some(s => s.name === prev) ? prev : (data.sheets[0]?.name || '')
        );
        try {
          localStorage.setItem(storageKey, JSON.stringify(data));
          window.dispatchEvent(new CustomEvent('sheet-sync:updated', { detail: { pageKey } }));
        } catch {}
      }
    } catch (e: any) {
      setError(e?.message || 'could not sync from Google Sheets');
    } finally {
      setSyncing(false);
    }
  }, [pageKey, storageKey]);

  useEffect(() => {
    let cancelled = false;

    const apply = (d: AllProjectsData | null) => {
      if (cancelled || !d) return;
      setData(d);
      setActiveSheet(prev =>
        prev && d.sheets.some(s => s.name === prev) ? prev : (d.sheets[0]?.name || '')
      );
    };

    // 1) Show whatever is cached immediately (may be null on a fresh load).
    apply(loadCached(storageKey));
    setReady(true);

    // 2) Fetch this page's rows from the API on mount. This is the page's own
    //    on-demand load: its data is pulled only when the user is on it, not up
    //    front for every page. Drop the loader once it settles, whatever the
    //    outcome.
    refresh().finally(() => { if (!cancelled) setLoading(false); });

    // 3) Re-read cache when a sheet-sync:updated event or another tab refreshes it.
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.pageKey && detail.pageKey !== pageKey) return;
      apply(loadCached(storageKey));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) apply(loadCached(storageKey));
    };
    window.addEventListener('sheet-sync:updated', onUpdated);
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener('sheet-sync:updated', onUpdated);
      window.removeEventListener('storage', onStorage);
    };
  }, [storageKey, pageKey, refresh]);

  // Seed the search box from the header search bar (?q=...) and keep it in sync
  // when the query param changes (e.g. a second header search).
  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  const sheet: AllProjectsSheet | undefined = useMemo(
    () => data?.sheets.find(s => s.name === activeSheet),
    [data, activeSheet]
  );

  // Column order for the sheet's own (synced) columns. The server already
  // applies the stored order, so `headers` matches `sheet.headers` except while
  // a local move is still in flight.
  const EMPTY: string[] = useMemo(() => [], []);
  const { headers: orderedHeaders, reorderHeaders: reorderAllHeaders, orderError } = useHeaderOrder(
    pageKey, activeSheet, sheet?.headers ?? EMPTY
  );

  // Drop any columns hidden for this page (data is kept in the DB; see
  // HIDDEN_COLUMNS). Done here so every downstream use of `headers` — the header
  // row, the cells, the whole-row editor — skips them together.
  const headers = useMemo(() => {
    const hidden = HIDDEN_COLUMNS[pageKey];
    if (!hidden?.length) return orderedHeaders;
    const hiddenSet = new Set(hidden.map(normalizeHeader));
    return orderedHeaders.filter(h => !hiddenSet.has(normalizeHeader(h)));
  }, [orderedHeaders, pageKey]);

  // ReorderableHeader passes indices into the *visible* header list, but the
  // persisted order is the full list including hidden columns. Translate through
  // the header labels so a drag moves the right column even when some are hidden.
  const reorderHeaders = useCallback((from: number, to: number) => {
    if (headers === orderedHeaders) return reorderAllHeaders(from, to);
    const fromLabel = headers[from];
    const toLabel = headers[to];
    const realFrom = orderedHeaders.indexOf(fromLabel);
    const realTo = orderedHeaders.indexOf(toLabel);
    if (realFrom === -1 || realTo === -1) return;
    return reorderAllHeaders(realFrom, realTo);
  }, [headers, orderedHeaders, reorderAllHeaders]);

  // Clickable Project Manager cells → drill-down modal.
  const { renderPMCell, pmModal } = usePMDrilldown(headers);
  const { renderProjectNameCell, credModal } = useProjectCredentials(headers, pageKey, refresh);

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
      const res = await fetch(`/api/sheet-rows/${pageKey}`, {
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
      const res = await fetch(`/api/sheet-rows/${pageKey}`, {
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

  // Add a blank project row to the active tab, then open it inline for editing
  // so the user can fill in the project name and the rest. The row lands at the
  // bottom (see insertUserRow), so jump to the last page to reveal it.
  const addRow = async () => {
    if (!sheet || adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheet-rows/${pageKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName: sheet.name, cells: {} }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'could not add a new project');
      // Clear the search first so the new (empty) row isn't filtered out, then
      // reveal it: it lands at the bottom, and usePagination clamps an
      // over-large page number to the last page.
      setQuery('');
      await refresh();
      const newRow = json?.row as SheetRowRecord | undefined;
      if (newRow?.uid) {
        setEditingUid(newRow.uid);
        const draft: Record<string, string> = {};
        for (const h of sheet.headers) draft[h] = '';
        setEditDraft(draft);
      }
      setPage(Number.MAX_SAFE_INTEGER);
    } catch (e: any) {
      setError(e?.message || 'could not add a new project');
    } finally {
      setAdding(false);
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
      const res = await fetch(`/api/sheet-rows/${pageKey}?uid=${encodeURIComponent(row.uid)}`, {
        method: 'DELETE',
      });
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
      format, scope, pageKey, data, sheet, headers, filteredRows,
    });

  if (!ready) return null;
  // Fresh visit with nothing cached yet: spin until the first pull lands rather
  // than flashing the empty "No data loaded yet" state.
  if (loading && !data) return <PageLoader />;

  const totalRows = sheet?.rows.length ?? 0;
  // Rows across every tab — shown against the whole-page export option.
  const pageTotalRows = data?.sheets.reduce((n, s) => n + s.rows.length, 0) ?? 0;

  const totalRows = sheet?.rows.length ?? 0;
  // Rows across every tab — shown against the whole-page export option.
  const pageTotalRows = data?.sheets.reduce((n, s) => n + s.rows.length, 0) ?? 0;

  return (
    <section className="space-y-3 bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {data
              ? <>Last updated {fmtTime(data.syncedAt)}</>
              : 'No data loaded yet.'}
          </p>
        </div>
      </div>

      {(error || orderError) && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error || orderError}
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
                {formatHeadingName(s.name)}
                <span className="ml-2 text-xs text-slate-400">{s.rows.length}</span>
              </button>
            ))}
          </div>

          {sheet && (
            <div className="space-y-2">
              {/* Search + scroll arrows stay reachable while the sheet scrolls.
                  top-16 clears the h-16 Topbar; z-10 keeps it under that bar's
                  z-20. The negative margins + padding let the opaque background
                  span the panel's p-4 gutter, so rows can't show through at the
                  edges as they pass beneath. */}
              <div className="sticky top-16 z-10 -mx-4 bg-white px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={`Search in ${sheet.name}…`}
                  className="w-full sm:max-w-xs px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
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
                  <div className="text-xs text-slate-500 whitespace-nowrap">
                    {filteredRows.length} of {totalRows} rows
                  </div>
                  {/* Manual Sync — re-pulls the source Google Sheet so edits made
                      directly in the sheet show up here. Available to everyone,
                      like search/export; it changes no data on the sheet. */}
                  <button
                    type="button"
                    onClick={syncFromGoogle}
                    disabled={syncing}
                    title="Pull the latest from the Google Sheet"
                    className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm disabled:opacity-60"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={syncing ? 'animate-spin' : ''}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    {syncing ? 'Syncing…' : 'Sync'}
                  </button>
                  <ExportMenu
                    onExport={exportData}
                    activeSheetName={sheet.name}
                    sheetCount={data.sheets.length}
                    filteredCount={filteredRows.length}
                    totalCount={pageTotalRows}
                  />
                  {/* On Live Projects, "Add Project" opens the Website Delivery
                      form and is available to EVERYONE (signed-out included) —
                      the form page is open to all. On other pages the button does
                      a blank inline add, which is an edit action, so it stays
                      hidden for signed-out (read-only) users. */}
                  {(addOpensForm || canEdit) && (
                    <button
                      type="button"
                      onClick={addOpensForm ? () => router.push('/website-delivery-2') : addRow}
                      disabled={adding}
                      title={addOpensForm ? 'Open the project delivery form' : 'Add a new project row to this sheet'}
                      className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-emerald-600 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm disabled:opacity-60"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      {addOpensForm ? 'Add Project' : (adding ? 'Adding…' : 'New Project')}
                    </button>
                  )}
                </div>
              </div>

              <div ref={scrollRef} className="overflow-auto border border-slate-200 rounded-xl scroll-smooth">
                <table className="min-w-full text-sm text-black">
                  <thead className="bg-slate-50 text-black font-semibold sticky top-0">
                    <tr>
                      {headers.map((h, i) => (
                        <ReorderableHeader
                          key={h}
                          index={i}
                          count={headers.length}
                          group="sheet-header"
                          label={h}
                          onMove={reorderHeaders}
                        >
                          {h}
                        </ReorderableHeader>
                      ))}
                      {/* The Actions column holds only edit/delete controls, so
                          it disappears entirely for signed-out (read-only) users. */}
                      {canEdit && (
                        <th className="text-right font-semibold text-black px-3 py-2 whitespace-nowrap border-b border-slate-200 sticky right-0 bg-slate-50">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(row => {
                      const isEditing = editingUid === row.uid;
                      return (
                        <tr key={row.uid} className="odd:bg-white even:bg-slate-50/40 hover:bg-indigo-50/40">
                          {headers.map(h => {
                            const v = row.cells[h];
                            if (isEditing) {
                              if (isScopeHeader(h)) {
                                return (
                                  <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate text-black">
                                    <select
                                      value={editDraft[h] ?? ''}
                                      onChange={e => setEditDraft(d => ({ ...d, [h]: e.target.value }))}
                                      className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-sm text-black bg-white"
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
                                      className="w-full min-w-[12rem] px-2 py-1 rounded border border-slate-300 text-sm text-black bg-white"
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
                                      className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-sm text-black bg-white"
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
                                      className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-sm text-black bg-white"
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
                                      className="w-full min-w-[10rem] px-2 py-1 rounded border border-slate-300 text-sm text-black bg-white"
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
                                      className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-sm text-black bg-white"
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
                              if (isCompletedHeader(h)) {
                                return (
                                  <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate text-black">
                                    <select
                                      value={editDraft[h] ?? ''}
                                      onChange={e => setEditDraft(d => ({ ...d, [h]: e.target.value }))}
                                      className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-sm text-black bg-white"
                                    >
                                      <option value="">Select…</option>
                                      {COMPLETED_OPTIONS.map(o => (
                                        <option key={o} value={o}>{o}</option>
                                      ))}
                                      {editDraft[h] && !COMPLETED_OPTIONS.includes(editDraft[h]) && (
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
                                    className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-sm text-black"
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
                                  className="border-b border-slate-100 text-black"
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
                                className="border-b border-slate-100 text-black"
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
                                    className="text-emerald-600 hover:text-emerald-700 text-xs font-medium mr-3 disabled:opacity-50">
                                    {rowBusy ? 'Saving…' : 'Save'}
                                  </button>
                                  <button onClick={cancelEdit}
                                    className="text-slate-500 hover:text-slate-700 text-xs font-medium">Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => beginEdit(row)}
                                    className="text-indigo-600 hover:text-indigo-700 text-xs font-medium mr-3">Edit</button>
                                  <button onClick={() => deleteRow(row)}
                                    className="text-rose-600 hover:text-rose-700 text-xs font-medium">
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
                        <td colSpan={(headers.length || 1) + (canEdit ? 1 : 0)} className="px-3 py-6 text-center text-slate-500">
                          {totalRows === 0 ? 'No rows yet.' : 'No matching rows.'}
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
              />
            </div>
          )}
        </>
      )}

      {pmModal}
      {credModal}
    </section>
  );
}

export default function SheetSyncPanel(props: {
  pageKey: SheetSyncPageKey;
  title?: string;
}) {
  return (
    <Suspense fallback={null}>
      <SheetSyncPanelInner {...props} />
    </Suspense>
  );
}
