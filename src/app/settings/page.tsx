'use client';
import { useRef } from 'react';
import * as XLSX from 'xlsx';
import { useStore } from '@/lib/store';
import { useMarketing } from '@/lib/marketing';
import { download } from '@/lib/ui';
import { CSV_HEADERS, FIELDS, type Project } from '@/lib/types';

export default function SettingsPage() {
  const { projects, exportCSV, clear, storageSize, upsert } = useStore();
  const { clear: clearMarketing } = useMarketing();
  const xlsxRef = useRef<HTMLInputElement>(null);

  const exportXLSX = () => {
    const rows = [CSV_HEADERS, ...projects.map(p => FIELDS.map(f => {
      const v = (p as any)[f];
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      return v ?? '';
    }))];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Projects');
    XLSX.writeFile(wb, 'projects.xlsx');
  };

  const onImportXLSX = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
      let imported = 0;
      rows.forEach(r => {
        const p: Project = { id: '' };
        CSV_HEADERS.forEach((h, i) => {
          const key = FIELDS[i];
          const v = r[h];
          if (v !== undefined && v !== '') (p as any)[key] = String(v);
        });
        if (p.projectName) { upsert(p); imported++; }
      });
      alert(`Imported ${imported} rows from ${f.name}`);
    } catch (e: any) {
      alert(`Import failed: ${e.message}`);
    }
  };

  const sizeKb = storageSize() / 1024;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-white p-5 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Data &amp; Backup</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-slate-200 px-2.5 py-1 text-[10.5px] font-medium text-slate-700 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              local storage
            </span>
          </div>
          <p className="mt-2 text-[12px] text-slate-600">Export, import, and manage everything stored in your browser.</p>
        </div>
      </div>

      {/* Storage stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniStat label="Projects" value={projects.length} tone="brand" />
        <MiniStat label="Storage" value={`${sizeKb.toFixed(1)} KB`} tone="violet" />
        <MiniStat label="Fields / project" value={FIELDS.length} tone="sky" />
      </div>

      {/* Export */}
      <Section
        title="Export"
        subtitle="Download your data as CSV or Excel."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
        tone="brand"
      >
        <div className="flex flex-wrap gap-2">
          <button onClick={() => download('projects.csv', exportCSV(), 'text/csv')}
            className="inline-flex h-9 px-3.5 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-[12px] font-semibold hover:from-brand-700 hover:to-brand-800 items-center shadow-md hover:shadow-lg transition-all">
            Export CSV
          </button>
          <button onClick={exportXLSX}
            className="inline-flex h-9 px-3.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 hover:border-slate-300 items-center shadow-sm transition-colors">
            Export Excel (.xlsx)
          </button>
        </div>
      </Section>

      {/* Import */}
      <Section
        title="Import"
        subtitle="Load projects from an Excel / CSV file."
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
        tone="sky"
      >
        <div className="flex flex-wrap gap-2">
          <button onClick={() => xlsxRef.current?.click()}
            className="inline-flex h-9 px-3.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 hover:border-slate-300 items-center shadow-sm transition-colors">
            Import Excel / CSV
          </button>
          <input ref={xlsxRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onImportXLSX(f); e.target.value = ''; }} />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">Excel/CSV imports expect the same column headers as the Export CSV.</p>
      </Section>

      {/* Danger */}
      <section className="relative overflow-hidden rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/60 via-white to-white shadow-sm">
        <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="relative p-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-slate-900 tracking-tight">Danger zone</div>
              <div className="text-[11.5px] text-slate-600 mt-0.5">Permanently delete every project and marketing task stored locally.</div>
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={() => { if (confirm('Are you sure you want to clear all data?\n\nAll project data and related records will be permanently deleted. This action cannot be undone.')) { clear(); clearMarketing(); } }}
              className="inline-flex h-9 px-3.5 rounded-lg bg-white border border-rose-300 text-rose-700 text-[12px] font-semibold hover:bg-rose-50 items-center shadow-sm transition-colors">
              Clear All Data
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

type Tone = 'brand' | 'violet' | 'sky';
const TONES: Record<Tone, { grad: string; ring: string; text: string; icon: string; iconBg: string }> = {
  brand:  { grad: 'from-brand-500/10 to-brand-500/0',   ring: 'ring-brand-500/20',  text: 'text-brand-700',  icon: 'text-brand-600',  iconBg: 'bg-brand-50' },
  violet: { grad: 'from-violet-500/10 to-violet-500/0', ring: 'ring-violet-500/20', text: 'text-violet-700', icon: 'text-violet-600', iconBg: 'bg-violet-50' },
  sky:    { grad: 'from-sky-500/10 to-sky-500/0',       ring: 'ring-sky-500/20',    text: 'text-sky-700',    icon: 'text-sky-600',    iconBg: 'bg-sky-50' },
};

function Section({ title, subtitle, icon, tone, children }: { title: string; subtitle?: string; icon: React.ReactNode; tone: Tone; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-b from-slate-50/60 to-white flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg ${t.iconBg} ${t.icon} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900 tracking-tight">{title}</div>
          {subtitle && <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number | string; tone: Tone }) {
  const t = TONES[tone];
  return (
    <div className={`relative overflow-hidden rounded-xl bg-white border border-slate-200/70 ring-1 ${t.ring} px-4 py-3 shadow-sm`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${t.grad} opacity-60 pointer-events-none`} />
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`mt-1 text-[24px] font-bold tabular-nums leading-none ${t.text}`}>{value}</div>
      </div>
    </div>
  );
}
