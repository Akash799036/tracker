'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  SHEET_SYNC_STORAGE_KEY,
  type AllProjectsData,
  type AllProjectsSheet,
  type SheetRow,
  type SheetSyncPageKey,
} from '@/lib/sheetSync';
import { download } from '@/lib/ui';

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

// Per-sheet local overrides on top of the read-only synced data.
// Shape: { [sheetName]: { edits: { [rowIndex]: Partial<SheetRow> }, deletes: number[] } }
type OverrideMap = Record<string, { edits: Record<number, Record<string, string>>; deletes: number[] }>;
const OVERRIDES_KEY = (pageKey: string) => `sheet-sync.${pageKey}.overrides.v1`;

function loadOverrides(pageKey: string): OverrideMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY(pageKey));
    return raw ? (JSON.parse(raw) as OverrideMap) : {};
  } catch { return {}; }
}

function saveOverrides(pageKey: string, map: OverrideMap) {
  try { localStorage.setItem(OVERRIDES_KEY(pageKey), JSON.stringify(map)); } catch {}
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
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});

  const toStr = (v: unknown) => (v == null ? '' : String(v));
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
    setOverrides(loadOverrides(pageKey));
    setReady(true);
  }, [storageKey, pageKey]);

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

  const sheetOverride = overrides[activeSheet] || { edits: {}, deletes: [] };

  // Rows with edits applied and deletes filtered out, preserving original indices.
  const visibleRows = useMemo(() => {
    if (!sheet) return [] as { row: Record<string, string>; origIdx: number }[];
    const deletes = new Set(sheetOverride.deletes);
    return sheet.rows
      .map((r, i) => ({ row: { ...r, ...(sheetOverride.edits[i] || {}) }, origIdx: i }))
      .filter(x => !deletes.has(x.origIdx));
  }, [sheet, sheetOverride]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleRows;
    return visibleRows.filter(x =>
      Object.values(x.row).some(v => String(v ?? '').toLowerCase().includes(q))
    );
  }, [visibleRows, query]);

  const beginEdit = (origIdx: number, row: SheetRow) => {
    setEditingIdx(origIdx);
    const draft: Record<string, string> = {};
    for (const k of Object.keys(row)) draft[k] = toStr(row[k]);
    setEditDraft(draft);
  };
  const cancelEdit = () => { setEditingIdx(null); setEditDraft({}); };
  const saveEdit = (origIdx: number) => {
    if (!sheet) return;
    const original = sheet.rows[origIdx] || {};
    const diff: Record<string, string> = {};
    for (const h of sheet.headers) {
      const next = editDraft[h] ?? '';
      if (String(original[h] ?? '') !== next) diff[h] = next;
    }
    const nextMap: OverrideMap = { ...overrides };
    const prev = nextMap[activeSheet] || { edits: {}, deletes: [] };
    const edits = { ...prev.edits };
    if (Object.keys(diff).length === 0) delete edits[origIdx];
    else edits[origIdx] = { ...(prev.edits[origIdx] || {}), ...diff };
    nextMap[activeSheet] = { ...prev, edits };
    setOverrides(nextMap);
    saveOverrides(pageKey, nextMap);
    cancelEdit();
  };
  const exportData = (format: 'xlsx' | 'csv' | 'json') => {
    if (!sheet) return;
    const rows = filteredRows.map(x => x.row);
    const headers = sheet.headers;
    const baseName = `${pageKey}-${sheet.name}`.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    if (format === 'json') {
      download(`${baseName}.json`, JSON.stringify(rows, null, 2), 'application/json');
      return;
    }
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

  const deleteRow = (origIdx: number) => {
    if (!confirm('Delete this row? (Local only — will not affect Google Sheet.)')) return;
    const nextMap: OverrideMap = { ...overrides };
    const prev = nextMap[activeSheet] || { edits: {}, deletes: [] };
    if (prev.deletes.includes(origIdx)) return;
    nextMap[activeSheet] = { ...prev, deletes: [...prev.deletes, origIdx] };
    setOverrides(nextMap);
    saveOverrides(pageKey, nextMap);
    if (editingIdx === origIdx) cancelEdit();
  };

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
                    {filteredRows.length} of {sheet.rows.length} rows
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
                      className="px-2.5 h-8 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border-r border-slate-200"
                      title="Export current view as CSV"
                    >CSV</button>
                    <button
                      type="button"
                      onClick={() => exportData('json')}
                      className="px-2.5 h-8 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50"
                      title="Export current view as JSON"
                    >JSON</button>
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
                      <th className="text-right font-semibold px-3 py-2 whitespace-nowrap border-b border-slate-200 sticky right-0 bg-slate-50">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(({ row, origIdx }) => {
                      const isEditing = editingIdx === origIdx;
                      return (
                        <tr key={origIdx} className="odd:bg-white even:bg-slate-50/40 hover:bg-indigo-50/40">
                          {sheet.headers.map(h => {
                            const v = row[h];
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
                                  : (v == null ? '' : String(v))}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap text-right sticky right-0 bg-white">
                            {isEditing ? (
                              <>
                                <button onClick={() => saveEdit(origIdx)}
                                  className="text-emerald-600 hover:text-emerald-700 text-xs font-medium mr-3">Save</button>
                                <button onClick={cancelEdit}
                                  className="text-slate-500 hover:text-slate-700 text-xs font-medium">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => beginEdit(origIdx, row)}
                                  className="text-indigo-600 hover:text-indigo-700 text-xs font-medium mr-3">Edit</button>
                                <button onClick={() => deleteRow(origIdx)}
                                  className="text-rose-600 hover:text-rose-700 text-xs font-medium">Delete</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={(sheet.headers.length || 1) + 1} className="px-3 py-6 text-center text-slate-500">
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
