'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  SHEET_SYNC_STORAGE_KEY,
  type AllProjectsData,
  type AllProjectsSheet,
  type SheetRowRecord,
  type SheetSyncPageKey,
} from '@/lib/sheetSync';
import { exportSheetData, type ExportFormat, type ExportScope } from '@/lib/sheetExport';
import { useCustomFields, vkey } from '@/lib/useCustomFields';
import { useConfirm } from '@/lib/confirm';
import { useHeaderOrder } from '@/lib/useHeaderOrder';
import { usePMDrilldown } from '@/lib/usePMDrilldown';
import { useHorizontalScroll } from '@/lib/useHorizontalScroll';
import { ReorderableHeader } from './ReorderableHeader';
import { AddColumnButton, CustomFieldCell, CustomFieldHeader } from './CustomFieldControls';
import { SheetCell } from './SheetCell';
import { AddRowButton, AddRowFormRow } from './AddRowForm';
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

export default function SheetSyncPanel({
  pageKey,
  title = 'Project Data',
}: {
  pageKey: SheetSyncPageKey;
  title?: string;
}) {
  const storageKey = SHEET_SYNC_STORAGE_KEY(pageKey);
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [data, setData] = useState<AllProjectsData | null>(null);
  const [ready, setReady] = useState(false);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [addingRow, setAddingRow] = useState(false);
  const [rowBusy, setRowBusy] = useState(false);

  // Custom fields (extra columns) for the active sheet, backed by the database.
  const {
    fields: customFields,
    values: customValues,
    error: customError,
    addField: addCustomField,
    deleteField: deleteCustomField,
    setValue: saveCustomValue,
    reorderFields: reorderCustomFields,
  } = useCustomFields(pageKey, activeSheet);

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
        try { localStorage.setItem(storageKey, JSON.stringify(json)); } catch {}
      }
    } catch { /* keep whatever is on screen */ }
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

    // 2) Fetch from the API so the panel doesn't depend on AutoSheetSync winning
    //    the mount race. This populates data even on the very first visit.
    refresh();

    // 3) Re-read cache when AutoSheetSync (or another tab) refreshes it.
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
  const { headers, reorderHeaders, orderError } = useHeaderOrder(
    pageKey, activeSheet, sheet?.headers ?? EMPTY
  );

  // Clickable Project Manager cells → drill-down modal.
  const { renderPMCell, pmModal } = usePMDrilldown(headers);

  // Search spans the sheet's own cells and the custom-field columns, so a row is
  // findable by anything visible on it.
  const filteredRows = useMemo(() => {
    const rows = sheet?.rows ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => {
      if (Object.values(r.cells).some(v => toStr(v).toLowerCase().includes(q))) return true;
      return customFields.some(f => (customValues[vkey(f.id, r.uid)] ?? '').toLowerCase().includes(q));
    });
  }, [sheet, query, customFields, customValues]);

  // Cap the table at 20 rows; searching or switching sheets returns to page 1.
  const { page, setPage, totalPages, pageRows, from, to } = usePagination(
    filteredRows, `${activeSheet}|${query}`
  );

  const beginEdit = (row: SheetRowRecord) => {
    setEditingUid(row.uid);
    const draft: Record<string, string> = {};
    for (const h of sheet?.headers ?? []) draft[h] = toStr(row.cells[h]);
    setEditDraft(draft);
  };
  const cancelEdit = () => { setEditingUid(null); setEditDraft({}); };

  const saveEdit = async (row: SheetRowRecord) => {
    if (!sheet) return;
    const diff: Record<string, string> = {};
    for (const h of sheet.headers) {
      const next = editDraft[h] ?? '';
      if (toStr(row.cells[h]) !== next) diff[h] = next;
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

  const addRow = async (cells: Record<string, string>) => {
    if (!sheet) return false;
    setRowBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheet-rows/${pageKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName: sheet.name, cells }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'could not add that row');
      await refresh();
      setAddingRow(false);
      return true;
    } catch (e: any) {
      setError(e?.message || 'could not add that row');
      return false;
    } finally {
      setRowBusy(false);
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
      format, scope, pageKey, data, sheet, headers, filteredRows, customFields, customValues,
    });

  if (!ready) return null;

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

      {(error || customError || orderError) && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error || customError || orderError}
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
                  <ExportMenu
                    onExport={exportData}
                    activeSheetName={sheet.name}
                    sheetCount={data.sheets.length}
                    filteredCount={filteredRows.length}
                    totalCount={pageTotalRows}
                  />
                  <AddRowButton onClick={() => setAddingRow(true)} disabled={addingRow || rowBusy} />
                  <AddColumnButton onAdd={addCustomField} disabled={rowBusy} />
                </div>
              </div>

              <div ref={scrollRef} className="overflow-auto border border-slate-200 rounded-xl scroll-smooth">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0">
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
                      {customFields.map((f, i) => (
                        <CustomFieldHeader
                          key={`cf-${f.id}`}
                          field={f}
                          index={i}
                          count={customFields.length}
                          onMove={reorderCustomFields}
                          onDelete={deleteCustomField}
                        />
                      ))}
                      <th className="text-right font-semibold px-3 py-2 whitespace-nowrap border-b border-slate-200 sticky right-0 bg-slate-50">
                        Actions
                      </th>
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
                              return (
                                <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate">
                                  <input
                                    value={editDraft[h] ?? ''}
                                    onChange={e => setEditDraft(d => ({ ...d, [h]: e.target.value }))}
                                    className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-sm"
                                  />
                                </td>
                              );
                            }
                            return (
                              <SheetCell
                                key={h}
                                value={toStr(v)}
                                onSave={next => saveCell(row, h, next)}
                                className="border-b border-slate-100"
                              >
                                {looksLikeUrl(v)
                                  ? <a href={v} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-indigo-600 hover:underline break-all">{v}</a>
                                  : renderPMCell(h, v, toStr(v))}
                              </SheetCell>
                            );
                          })}
                          {customFields.map(f => (
                            <CustomFieldCell
                              key={`cf-${f.id}`}
                              value={customValues[vkey(f.id, row.uid)] ?? ''}
                              onSave={val => saveCustomValue(f.id, row.uid, val)}
                            />
                          ))}
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
                        <td colSpan={(headers.length || 1) + customFields.length + 1} className="px-3 py-6 text-center text-slate-500">
                          {totalRows === 0 ? 'No rows yet. Use Add Row to create one.' : 'No matching rows.'}
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
    </section>
  );
}
