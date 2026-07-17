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

// Database-backed custom fields for the active sheet.
type CustomField = { id: number; pageKey: string; sheetName: string; label: string; position: number };
type CustomFieldValue = { fieldId: number; rowKey: number; value: string };
// value lookup keyed as `${fieldId}:${rowKey}`
type ValueMap = Record<string, string>;
const vkey = (fieldId: number, rowKey: number) => `${fieldId}:${rowKey}`;

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
  const [data, setData] = useState<AllProjectsData | null>(null);
  const [ready, setReady] = useState(false);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});

  // Custom fields (extra columns) for the active sheet, backed by the database.
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<ValueMap>({});
  const [addingField, setAddingField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [customBusy, setCustomBusy] = useState(false);

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

  // Load custom fields + values whenever the active sheet changes.
  const loadCustomFields = useCallback(async (sheetName: string) => {
    if (!sheetName) { setCustomFields([]); setCustomValues({}); return; }
    try {
      const res = await fetch(
        `/api/custom-fields/${pageKey}?sheet=${encodeURIComponent(sheetName)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed to load fields');
      const fields = (json.fields || []) as CustomField[];
      const values = (json.values || []) as CustomFieldValue[];
      const map: ValueMap = {};
      for (const v of values) map[vkey(v.fieldId, v.rowKey)] = v.value;
      setCustomFields(fields);
      setCustomValues(map);
    } catch {
      setCustomFields([]);
      setCustomValues({});
    }
  }, [pageKey]);

  useEffect(() => { loadCustomFields(activeSheet); }, [activeSheet, loadCustomFields]);

  const addCustomField = useCallback(async () => {
    const label = newFieldLabel.trim();
    if (!label || !activeSheet) return;
    setCustomBusy(true);
    try {
      const res = await fetch(`/api/custom-fields/${pageKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName: activeSheet, label }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed to add field');
      setCustomFields(prev => [...prev, json.field as CustomField]);
      setNewFieldLabel('');
      setAddingField(false);
    } catch (e: any) {
      setError(e?.message || 'failed to add field');
    } finally {
      setCustomBusy(false);
    }
  }, [newFieldLabel, activeSheet, pageKey]);

  const deleteCustomField = useCallback(async (field: CustomField) => {
    if (!confirm(`Delete the "${field.label}" field and all its values?`)) return;
    try {
      const res = await fetch(`/api/custom-fields/${pageKey}?id=${field.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'failed to delete field');
      }
      setCustomFields(prev => prev.filter(f => f.id !== field.id));
      setCustomValues(prev => {
        const next = { ...prev };
        for (const k of Object.keys(next)) if (k.startsWith(`${field.id}:`)) delete next[k];
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'failed to delete field');
    }
  }, [pageKey]);

  // Persist a single custom-field cell value.
  const saveCustomValue = useCallback(async (fieldId: number, rowKey: number, value: string) => {
    setCustomValues(prev => ({ ...prev, [vkey(fieldId, rowKey)]: value }));
    try {
      await fetch(`/api/custom-fields/${pageKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldId, rowKey, value }),
      });
    } catch { /* value stays in local state; will re-sync on next load */ }
  }, [pageKey]);

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
    // Merge custom-field columns into the exported view.
    const rows = filteredRows.map(x => {
      const merged: Record<string, unknown> = { ...x.row };
      for (const f of customFields) merged[f.label] = customValues[vkey(f.id, x.origIdx)] ?? '';
      return merged;
    });
    const headers = [...sheet.headers, ...customFields.map(f => f.label)];
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
    if (!confirm('Delete this row? (Local only.)')) return;
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
              ? <>Last updated {fmtTime(data.syncedAt)}</>
              : 'No data loaded yet.'}
          </p>
        </div>
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
                  {addingField ? (
                    <div className="inline-flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={newFieldLabel}
                        onChange={e => setNewFieldLabel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') addCustomField();
                          if (e.key === 'Escape') { setAddingField(false); setNewFieldLabel(''); }
                        }}
                        placeholder="Field name…"
                        className="h-8 w-40 px-2 rounded-lg border border-slate-300 text-xs"
                      />
                      <button
                        type="button"
                        onClick={addCustomField}
                        disabled={customBusy || !newFieldLabel.trim()}
                        className="h-8 px-2.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                      >{customBusy ? 'Adding…' : 'Add'}</button>
                      <button
                        type="button"
                        onClick={() => { setAddingField(false); setNewFieldLabel(''); }}
                        className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >Cancel</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingField(true)}
                      className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-dashed border-indigo-300 text-xs font-semibold text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50"
                      title="Add a new field (column) to this sheet"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Field
                    </button>
                  )}
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
                        <th key={`cf-${f.id}`} className="text-left font-semibold px-3 py-2 whitespace-nowrap border-b border-slate-200 bg-indigo-50/40">
                          <span className="inline-flex items-center gap-1.5">
                            {f.label}
                            <button
                              type="button"
                              onClick={() => deleteCustomField(f)}
                              aria-label={`Delete field ${f.label}`}
                              title="Delete this field"
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </span>
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
                          {customFields.map(f => {
                            const cv = customValues[vkey(f.id, origIdx)] ?? '';
                            return (
                              <td key={`cf-${f.id}`} className="px-3 py-2 align-middle border-b border-slate-100 bg-indigo-50/20">
                                <input
                                  defaultValue={cv}
                                  key={cv}
                                  onBlur={e => {
                                    const val = e.target.value;
                                    if (val !== cv) saveCustomValue(f.id, origIdx, val);
                                  }}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                  placeholder="—"
                                  className="w-full min-w-[8rem] px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-indigo-400 focus:bg-white text-sm bg-transparent"
                                />
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
                        <td colSpan={(sheet.headers.length || 1) + customFields.length + 1} className="px-3 py-6 text-center text-slate-500">
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
