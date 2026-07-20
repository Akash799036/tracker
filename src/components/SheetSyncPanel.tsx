'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  SHEET_SYNC_STORAGE_KEY,
  type AllProjectsData,
  type AllProjectsSheet,
  type SheetRowRecord,
  type SheetSyncPageKey,
} from '@/lib/sheetSync';
import { download } from '@/lib/ui';
import { useCustomFields, vkey } from '@/lib/useCustomFields';
import { useRowExtras } from '@/lib/useRowExtras';
import { AddFieldButton, CustomFieldCell, CustomFieldHeader } from './CustomFieldControls';
import { AddRowButton, AddRowFormRow } from './AddRowForm';
import { RowExtrasCell } from './RowExtrasControls';

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
    busy: customBusy,
    error: customError,
    addField: addCustomField,
    deleteField: deleteCustomField,
    setValue: saveCustomValue,
  } = useCustomFields(pageKey, activeSheet);

  // Per-row ad-hoc fields for the active sheet.
  const {
    byRow: extrasByRow,
    allLabels: extraLabels,
    busy: extrasBusy,
    error: extrasError,
    addExtra,
    setExtraValue,
    renameExtra,
    deleteExtra,
    forgetRow,
  } = useRowExtras(pageKey, activeSheet);

  const toStr = (v: unknown) => (v == null ? '' : String(v));
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dx: number) => {
    scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  };

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

  // Search spans the sheet's own cells, the custom-field columns and the per-row
  // extras, so a row is findable by anything visible on it.
  const filteredRows = useMemo(() => {
    const rows = sheet?.rows ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => {
      if (Object.values(r.cells).some(v => toStr(v).toLowerCase().includes(q))) return true;
      if (customFields.some(f => (customValues[vkey(f.id, r.uid)] ?? '').toLowerCase().includes(q))) return true;
      const extras = extrasByRow.get(r.uid) || [];
      return extras.some(e =>
        e.label.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
      );
    });
  }, [sheet, query, customFields, customValues, extrasByRow]);

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
    const message = row.origin === 'user'
      ? 'Delete this row? This removes it for everyone, along with any fields on it.'
      : 'Hide this row? It came from the source sheet, so it will stay hidden until you restore it.';
    if (!confirm(message)) return;

    setError(null);
    try {
      const res = await fetch(`/api/sheet-rows/${pageKey}?uid=${encodeURIComponent(row.uid)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'could not delete that row');
      }
      forgetRow(row.uid);
      await refresh();
      if (editingUid === row.uid) cancelEdit();
    } catch (e: any) {
      setError(e?.message || 'could not delete that row');
    }
  };

  const exportData = (format: 'xlsx' | 'csv') => {
    if (!sheet) return;
    // Merge custom-field columns and every extras label into the exported view.
    const headers = [
      ...sheet.headers,
      ...customFields.map(f => f.label),
      ...extraLabels,
    ];
    const rows = filteredRows.map(r => {
      const merged: Record<string, unknown> = { ...r.cells };
      for (const f of customFields) merged[f.label] = customValues[vkey(f.id, r.uid)] ?? '';
      for (const e of extrasByRow.get(r.uid) || []) merged[e.label] = e.value;
      return merged;
    });
    const baseName = `${pageKey}-${sheet.name}`.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    if (format === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [headers.map(esc).join(',')];
      rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
      download(`${baseName}.csv`, lines.join('\n'), 'text/csv');
      return;
    }
    const aoa: (string | number | boolean)[][] = [headers.slice()];
    rows.forEach(r => aoa.push(headers.map(h => (r[h] == null ? '' : String(r[h])))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
    XLSX.writeFile(wb, `${baseName}.xlsx`);
  };

  if (!ready) return null;

  const totalRows = sheet?.rows.length ?? 0;

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

      {(error || customError || extrasError) && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error || customError || extrasError}
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
                  <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => exportData('xlsx')}
                      className="px-2.5 h-8 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border-r border-slate-200"
                      title="Export current view as Excel"
                    >Export .xlsx</button>
                    <button
                      type="button"
                      onClick={() => exportData('csv')}
                      className="px-2.5 h-8 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50"
                      title="Export current view as CSV"
                    >CSV</button>
                  </div>
                  <AddFieldButton onAdd={addCustomField} busy={customBusy} />
                  <AddRowButton onClick={() => setAddingRow(true)} disabled={addingRow || rowBusy} />
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
                      {customFields.map(f => (
                        <CustomFieldHeader key={`cf-${f.id}`} field={f} onDelete={deleteCustomField} />
                      ))}
                      {/* Pinned beside Actions: on a wide sheet these columns
                          would otherwise sit past the right edge, leaving the
                          per-row fields invisible until someone scrolls. */}
                      <th className="text-left font-semibold px-3 py-2 whitespace-nowrap border-b border-slate-200 bg-amber-50 sticky right-[7.5rem]">
                        Row fields
                      </th>
                      <th className="text-right font-semibold px-3 py-2 whitespace-nowrap border-b border-slate-200 sticky right-0 bg-slate-50">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(row => {
                      const isEditing = editingUid === row.uid;
                      return (
                        <tr key={row.uid} className="odd:bg-white even:bg-slate-50/40 hover:bg-indigo-50/40">
                          {sheet.headers.map(h => {
                            const v = row.cells[h];
                            return (
                              <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate">
                                {isEditing ? (
                                  <input
                                    value={editDraft[h] ?? ''}
                                    onChange={e => setEditDraft(d => ({ ...d, [h]: e.target.value }))}
                                    className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-sm"
                                  />
                                ) : looksLikeUrl(v)
                                  ? <a href={v} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline break-all">{v}</a>
                                  : toStr(v)}
                              </td>
                            );
                          })}
                          {customFields.map(f => (
                            <CustomFieldCell
                              key={`cf-${f.id}`}
                              value={customValues[vkey(f.id, row.uid)] ?? ''}
                              onSave={val => saveCustomValue(f.id, row.uid, val)}
                            />
                          ))}
                          <RowExtrasCell
                            rowUid={row.uid}
                            extras={extrasByRow.get(row.uid) || []}
                            onAdd={addExtra}
                            onSetValue={setExtraValue}
                            onRename={renameExtra}
                            onDelete={deleteExtra}
                            busy={extrasBusy}
                            className="sticky right-[7.5rem] bg-amber-50/70"
                          />
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
                                  {row.origin === 'user' ? 'Delete' : 'Hide'}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {addingRow && (
                      <AddRowFormRow
                        headers={sheet.headers}
                        trailingCols={customFields.length + 1}
                        busy={rowBusy}
                        onSave={addRow}
                        onCancel={() => setAddingRow(false)}
                        cellClassName="border-b border-slate-100"
                      />
                    )}
                    {filteredRows.length === 0 && !addingRow && (
                      <tr>
                        <td colSpan={(sheet.headers.length || 1) + customFields.length + 2} className="px-3 py-6 text-center text-slate-500">
                          {totalRows === 0 ? 'No rows yet. Use Add Row to create one.' : 'No matching rows.'}
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
