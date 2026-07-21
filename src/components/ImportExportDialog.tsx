'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { useStore } from '@/lib/store';
import { CSV_HEADERS, FIELDS, type Project } from '@/lib/types';
import { download } from '@/lib/ui';

type Mode = 'import' | 'export';
type Category =
  | 'all'
  | 'live'
  | 'ongoing'
  | 'priority'
  | 'maintenance'
  | 'marketing';
type Format = 'xlsx' | 'csv' | 'pdf';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'all', label: 'All Projects' },
  { value: 'live', label: 'Live Projects' },
  { value: 'ongoing', label: 'Ongoing Projects' },
  { value: 'priority', label: 'Priority Projects' },
  { value: 'maintenance', label: 'Maintenance Projects' },
  { value: 'marketing', label: 'Marketing Projects' },
];

const FORMATS: { value: Format; label: string; ext: string }[] = [
  { value: 'xlsx', label: 'Excel (.xlsx)', ext: 'xlsx' },
  { value: 'csv', label: 'CSV (.csv)', ext: 'csv' },
  { value: 'pdf', label: 'PDF (.pdf)', ext: 'pdf' },
];

function filterByCategory(projects: Project[], cat: Category): Project[] {
  const now = Date.now();
  switch (cat) {
    case 'all':
      return projects;
    case 'live':
      return projects.filter(
        p =>
          /live|delivered/i.test(p.status || '') ||
          (p.liveDate && new Date(p.liveDate).getTime() < now)
      );
    case 'ongoing':
      return projects.filter(p =>
        /progress|development|design|review|testing/i.test(p.status || '') ||
        /ongoing/i.test(p.projectCategory || '')
      );
    case 'priority': {
      const in14 = now + 14 * 86400_000;
      return projects.filter(p => {
        if (/hold|cancel/i.test(p.status || '')) return false;
        if (p.liveDate) {
          const t = new Date(p.liveDate).getTime();
          if (!isNaN(t) && t >= now && t <= in14) return true;
        }
        return /review|testing|development|design/i.test(p.status || '');
      });
    }
    case 'maintenance':
      return projects.filter(p => /maint/i.test(p.projectCategory || '') || /maint/i.test(p.projectScope || ''));
    case 'marketing':
      return projects.filter(p => /market/i.test(p.projectCategory || '') || /market/i.test(p.projectScope || ''));
  }
}

function toAOA(projects: Project[]): (string | number | boolean)[][] {
  const rows: (string | number | boolean)[][] = [CSV_HEADERS.slice()];
  projects.forEach(p => {
    rows.push(
      FIELDS.map(f => {
        const v = (p as any)[f];
        if (typeof v === 'boolean') return v ? 'Yes' : 'No';
        return v == null ? '' : String(v);
      })
    );
  });
  return rows;
}

function toCSV(projects: Project[]) {
  const esc = (v: unknown) => {
    let s: string;
    if (typeof v === 'boolean') s = v ? 'Yes' : 'No';
    else s = v == null ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [CSV_HEADERS.map(esc).join(',')];
  projects.forEach(p => rows.push(FIELDS.map(f => esc((p as any)[f])).join(',')));
  return rows.join('\n');
}

function printPDF(projects: Project[], title: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const head = CSV_HEADERS.map(h => `<th>${h}</th>`).join('');
  const body = projects
    .map(
      p =>
        `<tr>${FIELDS.map(f => {
          const v = (p as any)[f];
          const s = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v == null ? '' : String(v);
          return `<td>${s.replace(/</g, '&lt;')}</td>`;
        }).join('')}</tr>`
    )
    .join('');
  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;font-size:10px;padding:16px}
    h1{font-size:16px;margin:0 0 12px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
    th{background:#f1f5f9}</style></head>
    <body><h1>${title}</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <script>window.onload=()=>{window.print();}</script></body></html>`);
  w.document.close();
}

export default function ImportExportDialog({
  mode,
  onClose,
}: {
  mode: Mode;
  onClose: () => void;
}) {
  const store = useStore();
  const [category, setCategory] = useState<Category>('all');
  const [format, setFormat] = useState<Format>('xlsx');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => filterByCategory(store.projects, category),
    [store.projects, category]
  );

  const title = mode === 'import' ? 'Import Projects' : 'Export Projects';
  const catLabel = CATEGORIES.find(c => c.value === category)!.label;
  const baseName = catLabel.toLowerCase().replace(/\s+/g, '-');

  const importFormats = FORMATS.filter(f => f.value !== 'pdf');
  const availableFormats = mode === 'import' ? importFormats : FORMATS;

  useEffect(() => {
    if (mode === 'import' && format === 'pdf') setFormat('xlsx');
  }, [mode, format]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const doExport = () => {
    try {
      setBusy(true);
      if (format === 'xlsx') {
        const aoa = toAOA(filtered);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, catLabel.slice(0, 31));
        XLSX.writeFile(wb, `${baseName}.xlsx`);
      } else if (format === 'csv') {
        download(`${baseName}.csv`, toCSV(filtered), 'text/csv');
      } else if (format === 'pdf') {
        printPDF(filtered, catLabel);
      }
      setMsg(`Exported ${filtered.length} project${filtered.length === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setMsg(`Export failed: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const parseRows = (rows: any[]): Project[] => {
    const headerToField = new Map<string, string>();
    CSV_HEADERS.forEach((h, i) => headerToField.set(h.toLowerCase().trim(), FIELDS[i]));
    return rows
      .map(r => {
        const p: any = {};
        Object.keys(r).forEach(k => {
          const field = headerToField.get(String(k).toLowerCase().trim()) || k;
          let v = r[k];
          if (typeof v === 'string' && (v === 'Yes' || v === 'No')) v = v === 'Yes';
          p[field] = v;
        });
        return p as Project;
      })
      .filter(p => p.projectName || p.id);
  };

  const doImport = async (file: File) => {
    try {
      setBusy(true);
      let projectsToAdd: Project[] = [];
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      projectsToAdd = parseRows(rows);
      if (category !== 'all') {
        projectsToAdd = projectsToAdd.map(p => ({
          ...p,
          projectCategory: p.projectCategory || catLabel,
        }));
      }
      const count = store.importJSON(JSON.stringify(projectsToAdd));
      setMsg(`Imported ${count} project${count === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setMsg(`Import failed: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const acceptAttr =
    format === 'csv'
      ? '.csv,text/csv'
      : '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-slate-900 text-lg">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Project Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as Category)}
            className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">File Format</label>
          <select
            value={format}
            onChange={e => setFormat(e.target.value as Format)}
            className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
          >
            {availableFormats.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {mode === 'export' && (
          <p className="text-xs text-slate-500">
            {filtered.length} project{filtered.length === 1 ? '' : 's'} in <span className="font-medium text-slate-700">{catLabel}</span>.
          </p>
        )}

        {mode === 'import' && (
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Upload File</label>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) setSelectedFile(f);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors outline-none ${
                dragOver
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/50'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={dragOver ? 'text-brand-600' : 'text-slate-400'}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {selectedFile ? (
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-slate-800 break-all">{selectedFile.name}</div>
                  <div className="text-xs text-slate-500">Click or drop to replace</div>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-slate-700">
                    Drag & drop your file here
                  </div>
                  <div className="text-xs text-slate-500">
                    or <span className="text-brand-600 font-medium">click to browse</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {msg && <div className="text-sm rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700">{msg}</div>}

        <input
          ref={fileRef}
          type="file"
          accept={acceptAttr}
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) setSelectedFile(f);
            e.target.value = '';
          }}
        />

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-10 px-4 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
          {mode === 'export' ? (
            <button
              onClick={doExport}
              disabled={busy || !filtered.length}
              className="h-10 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {busy ? 'Exporting…' : 'Export'}
            </button>
          ) : (
            <button
              onClick={() => { if (selectedFile) doImport(selectedFile); }}
              disabled={busy || !selectedFile}
              className="h-10 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
