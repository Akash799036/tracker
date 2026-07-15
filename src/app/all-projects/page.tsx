'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { ALL_PROJECTS_STORAGE_KEY, type AllProjectsData, type AllProjectsSheet } from '@/lib/allProjectsTypes';
import { download } from '@/lib/ui';

type OverrideMap = Record<string, { edits: Record<number, Record<string, string>>; deletes: number[] }>;
const OVERRIDES_KEY = 'all-projects.overrides.v1';

function loadOverrides(): OverrideMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as OverrideMap) : {};
  } catch { return {}; }
}

function saveOverridesLS(map: OverrideMap) {
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map)); } catch {}
}

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
  const [data, setData] = useState<AllProjectsData | null>(null);
  const [ready, setReady] = useState(false);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'sync' | 'upload' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dx: number) => scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' });

  useEffect(() => {
    const cached = loadCached();
    if (cached) {
      setData(cached);
      setActiveSheet(cached.sheets[0]?.name || '');
    }
    setOverrides(loadOverrides());
    setReady(true);
  }, []);

  const applyData = useCallback((next: AllProjectsData) => {
    setData(next);
    persist(next);
    if (!next.sheets.find(s => s.name === activeSheet)) {
      setActiveSheet(next.sheets[0]?.name || '');
    }
  }, [activeSheet]);

  const runSync = useCallback(async () => {
    setBusy('sync'); setError(null);
    try {
      const res = await fetch('/api/all-projects/sync', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'sync failed');
      applyData(json as AllProjectsData);
    } catch (e: any) {
      setError(e?.message || 'sync failed');
    } finally {
      setBusy(null);
    }
  }, [applyData]);

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

  const sheetOverride = overrides[activeSheet] || { edits: {}, deletes: [] };

  const visibleRows = useMemo(() => {
    if (!sheet) return [] as { row: Record<string, any>; origIdx: number }[];
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

  const toStr = (v: unknown) => (v == null ? '' : String(v));

  const beginEdit = (origIdx: number, row: Record<string, any>) => {
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
      if (String((original as any)[h] ?? '') !== next) diff[h] = next;
    }
    const nextMap: OverrideMap = { ...overrides };
    const prev = nextMap[activeSheet] || { edits: {}, deletes: [] };
    const edits = { ...prev.edits };
    if (Object.keys(diff).length === 0) delete edits[origIdx];
    else edits[origIdx] = { ...(prev.edits[origIdx] || {}), ...diff };
    nextMap[activeSheet] = { ...prev, edits };
    setOverrides(nextMap);
    saveOverridesLS(nextMap);
    cancelEdit();
  };
  const deleteRow = (origIdx: number) => {
    if (!confirm('Delete this row? (Local only — will not affect the source sheet.)')) return;
    const nextMap: OverrideMap = { ...overrides };
    const prev = nextMap[activeSheet] || { edits: {}, deletes: [] };
    if (prev.deletes.includes(origIdx)) return;
    nextMap[activeSheet] = { ...prev, deletes: [...prev.deletes, origIdx] };
    setOverrides(nextMap);
    saveOverridesLS(nextMap);
    if (editingIdx === origIdx) cancelEdit();
  };

  const exportData = (format: 'xlsx' | 'csv' | 'json') => {
    if (!sheet) return;
    const rows = filteredRows.map(x => x.row);
    const headers = sheet.headers;
    const baseName = `all-projects-${sheet.name}`.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
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

  const totalRows = useMemo(
    () => data?.sheets.reduce((s, x) => s + x.rows.length, 0) || 0,
    [data]
  );

  if (!ready) return <div className="p-6 text-slate-500">Loading…</div>;

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
                : 'No data loaded yet. Sync from Google Sheets or upload a file.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={runSync}
              disabled={busy !== null}
              className="inline-flex h-9 px-3.5 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-[12px] font-semibold hover:from-brand-700 hover:to-brand-800 items-center gap-1.5 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>
              {busy === 'sync' ? 'Syncing…' : 'Sync Google Sheets'}
            </button>
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
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 to-rose-50/50 px-4 py-3 text-[12px] text-rose-700 flex items-start gap-2 shadow-sm">
          <span className="mt-0.5">⚠️</span>
          <span>{error}</span>
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
          <div className="text-[11.5px] text-slate-500 mt-1">Click <span className="font-semibold text-slate-700">Sync Google Sheets</span> or upload a file to begin.</div>
        </div>
      ) : (
        <>
          <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
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
                  {s.name}
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${s.name === activeSheet ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{s.rows.length}</span>
                </button>
              ))}
            </div>

            {sheet && (
              <>
                <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder={`Search in ${sheet.name}…`}
                      className="h-9 pl-9 pr-3 w-full sm:w-96 rounded-lg border border-slate-200 bg-white text-[13px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition"
                    />
                  </div>
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
                    <div className="text-[10.5px] tabular-nums text-slate-500 whitespace-nowrap">
                      <span className="font-semibold text-slate-700">{filteredRows.length}</span> of {sheet.rows.length}
                    </div>
                    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                      <button
                        type="button"
                        onClick={() => exportData('xlsx')}
                        className="px-2.5 h-8 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border-r border-slate-200"
                        title="Export current view as Excel"
                      >Export .xlsx</button>
                      <button
                        type="button"
                        onClick={() => exportData('csv')}
                        className="px-2.5 h-8 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border-r border-slate-200"
                      >CSV</button>
                      <button
                        type="button"
                        onClick={() => exportData('json')}
                        className="px-2.5 h-8 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50"
                      >JSON</button>
                    </div>
                  </div>
                </div>

                <div ref={scrollRef} className="overflow-auto max-h-[70vh] scroll-smooth">
                  <table className="min-w-full text-[12.5px]">
                    <thead className="bg-slate-50/80 backdrop-blur text-slate-600 sticky top-0 z-10">
                      <tr>
                        {sheet.headers.map(h => (
                          <th key={h} className="text-left text-[10.5px] uppercase tracking-wider font-semibold px-3 py-2.5 whitespace-nowrap border-b border-slate-200">
                            {h}
                          </th>
                        ))}
                        <th className="text-right text-[10.5px] uppercase tracking-wider font-semibold px-3 py-2.5 whitespace-nowrap border-b border-slate-200 sticky right-0 bg-slate-50/95">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map(({ row, origIdx }) => {
                        const isEditing = editingIdx === origIdx;
                        return (
                          <tr key={origIdx} className="hover:bg-brand-50/30 transition-colors">
                            {sheet.headers.map(h => {
                              const v = row[h];
                              return (
                                <td key={h} className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap max-w-[28rem] truncate text-slate-700">
                                  {isEditing ? (
                                    <input
                                      value={editDraft[h] ?? ''}
                                      onChange={e => setEditDraft(d => ({ ...d, [h]: e.target.value }))}
                                      className="w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-[12.5px]"
                                    />
                                  ) : looksLikeUrl(v)
                                    ? <a href={v} target="_blank" rel="noreferrer" className="text-brand-600 hover:text-brand-700 hover:underline break-all">{v}</a>
                                    : (v == null ? '' : String(v))}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 align-middle border-b border-slate-100 whitespace-nowrap text-right sticky right-0 bg-white">
                              {isEditing ? (
                                <>
                                  <button onClick={() => saveEdit(origIdx)}
                                    className="text-emerald-600 hover:text-emerald-700 text-[11px] font-semibold mr-3">Save</button>
                                  <button onClick={cancelEdit}
                                    className="text-slate-500 hover:text-slate-700 text-[11px] font-semibold">Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => beginEdit(origIdx, row)}
                                    className="text-brand-600 hover:text-brand-700 text-[11px] font-semibold mr-3">Edit</button>
                                  <button onClick={() => deleteRow(origIdx)}
                                    className="text-rose-600 hover:text-rose-700 text-[11px] font-semibold">Delete</button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredRows.length === 0 && (
                        <tr>
                          <td colSpan={(sheet.headers.length || 1) + 1} className="px-3 py-10 text-center text-slate-500 italic">
                            No matching rows.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
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
