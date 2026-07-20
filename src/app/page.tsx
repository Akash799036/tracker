'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { HBars, PALETTE } from '@/components/Charts';
import {
  CATEGORY_SOURCES,
  aggregateByCategory,
  aggregateByPM,
  aggregatePlatform,
  aggregateStatus,
  classifyStatuses,
  hydrateFromServer,
  readAllSummaries,
  type PMSummary,
  type PageSummary,
} from '@/lib/dashboardAggregate';

function fmtTime(ts: number | null) {
  if (!ts) return 'Not synced yet';
  try { return new Date(ts).toLocaleString(); } catch { return '—'; }
}

function relTime(ts: number | null) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type Tone = 'brand' | 'emerald' | 'amber' | 'rose' | 'violet' | 'sky' | 'slate';

const TONE_STYLES: Record<Tone, { grad: string; ring: string; text: string; icon: string; iconBg: string }> = {
  brand:   { grad: 'from-brand-500/10 to-brand-500/0',       ring: 'ring-brand-500/20',   text: 'text-brand-700',   icon: 'text-brand-600',   iconBg: 'bg-brand-50' },
  emerald: { grad: 'from-emerald-500/10 to-emerald-500/0',   ring: 'ring-emerald-500/20', text: 'text-emerald-700', icon: 'text-emerald-600', iconBg: 'bg-emerald-50' },
  amber:   { grad: 'from-amber-500/10 to-amber-500/0',       ring: 'ring-amber-500/20',   text: 'text-amber-700',   icon: 'text-amber-600',   iconBg: 'bg-amber-50' },
  rose:    { grad: 'from-rose-500/10 to-rose-500/0',         ring: 'ring-rose-500/20',    text: 'text-rose-700',    icon: 'text-rose-600',    iconBg: 'bg-rose-50' },
  violet:  { grad: 'from-violet-500/10 to-violet-500/0',     ring: 'ring-violet-500/20',  text: 'text-violet-700',  icon: 'text-violet-600',  iconBg: 'bg-violet-50' },
  sky:     { grad: 'from-sky-500/10 to-sky-500/0',           ring: 'ring-sky-500/20',     text: 'text-sky-700',     icon: 'text-sky-600',     iconBg: 'bg-sky-50' },
  slate:   { grad: 'from-slate-500/10 to-slate-500/0',       ring: 'ring-slate-500/20',   text: 'text-slate-700',   icon: 'text-slate-600',   iconBg: 'bg-slate-100' },
};

function StatCard({ label, value, sub, tone = 'slate', icon }: {
  label: string; value: number | string; sub?: string; tone?: Tone; icon: React.ReactNode;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className={`glass group relative overflow-hidden rounded-xl ring-1 ${t.ring} px-4 py-3.5 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${t.grad} opacity-70 pointer-events-none`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
          <div className={`mt-1 text-[26px] font-bold tabular-nums leading-none ${t.text}`}>{value}</div>
          {sub && <div className="mt-1.5 text-[11px] text-slate-500 truncate">{sub}</div>}
        </div>
        <div className={`shrink-0 h-9 w-9 rounded-lg ${t.iconBg} ${t.icon} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function CompactPipeline({ items, total }: { items: { label: string; value: number; color: string }[]; total: number }) {
  if (!total) {
    return <div className="py-8 text-center text-[11px] text-slate-500 italic">No status data yet</div>;
  }
  const top = items.filter(d => d.value > 0).slice(0, 5);
  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-500/10 ring-1 ring-inset ring-white/40">
        {top.map((d, i) => (
          <div
            key={i}
            style={{ width: `${(d.value / total) * 100}%`, background: d.color }}
            title={`${d.label}: ${d.value}`}
          />
        ))}
      </div>
      {/* Legend rows */}
      <div className="space-y-1.5">
        {top.map((d, i) => {
          const pct = (d.value / total) * 100;
          return (
            <div key={i} className="flex items-center gap-2.5 text-[12px]">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
              <span className="flex-1 font-medium text-slate-700 truncate">{d.label}</span>
              <span className="tabular-nums font-semibold text-slate-900">{d.value}</span>
              <span className="tabular-nums text-slate-500 w-10 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PageCard({ s, accent }: { s: PageSummary; accent: string }) {
  return (
    <Link
      href={s.source.href}
      className="glass group relative overflow-hidden flex items-center gap-3 rounded-xl px-3.5 py-3 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
      <div className="min-w-0 flex-1 pl-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[12.5px] font-semibold text-slate-900 truncate group-hover:text-brand-700">
            {s.source.label}
          </div>
          <div className="text-[18px] font-bold tabular-nums text-slate-900 leading-none">{s.totalRows}</div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-slate-500">
          <span className="truncate">
            {s.sheetCount ? `${s.sheetCount} sheet${s.sheetCount === 1 ? '' : 's'}` : 'No data'}
          </span>
          <span className={s.syncedAt ? 'text-slate-500' : 'text-slate-400'}>
            {s.syncedAt ? relTime(s.syncedAt) : 'not synced'}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Deterministic accent per PM so a person keeps one colour across the page. */
function pmColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string) {
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function PMAvatar({ name, size = 26 }: { name: string; size?: number }) {
  const color = pmColor(name);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-white"
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

/** Leaderboard row: one PM, their total, and their category split. */
function PMRow({ pm, max }: { pm: PMSummary; max: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors">
      <PMAvatar name={pm.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-semibold text-slate-900 truncate">{pm.name}</span>
          <span className="shrink-0 text-[12px] font-bold tabular-nums text-slate-900">{pm.total}</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-500/10">
          <div
            className="h-full rounded-full"
            style={{ width: `${(pm.total / max) * 100}%`, background: pmColor(pm.name) }}
          />
        </div>
        <div className="mt-1 truncate text-[10px] text-slate-500">
          {pm.categories.map(c => `${c.category} ${c.count}`).join(' · ')}
        </div>
      </div>
    </div>
  );
}

/* --- Icons --- */
const IconLayers = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
);
const IconPlay = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
);
const IconCheck = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
);
const IconEye = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
);
const IconPause = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
);

export default function Dashboard() {
  const [summaries, setSummaries] = useState<PageSummary[]>([]);
  // Categories draw on one extra workbook that has no page of its own.
  const [categorySummaries, setCategorySummaries] = useState<PageSummary[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setSummaries(readAllSummaries());
      setCategorySummaries(readAllSummaries(CATEGORY_SOURCES));
    };
    refresh();
    setReady(true);
    // Pull straight from the database so the dashboard is populated on first
    // visit rather than only after the user has opened every other page.
    hydrateFromServer().then(refresh);

    const watchedKeys = new Set(CATEGORY_SOURCES.map(s => s.storageKey));
    const onStorage = (e: StorageEvent) => {
      if (!e.key || watchedKeys.has(e.key)) refresh();
    };
    const onFocus = () => refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    const iv = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(iv);
    };
  }, []);

  const lastSync = useMemo(() => {
    const times = summaries.map(s => s.syncedAt).filter((t): t is number => !!t);
    return times.length ? Math.max(...times) : null;
  }, [summaries]);

  const statusMap = useMemo(() => aggregateStatus(summaries), [summaries]);
  const platformMap = useMemo(() => aggregatePlatform(summaries), [summaries]);
  const buckets = useMemo(() => classifyStatuses(statusMap), [statusMap]);

  const categories = useMemo(() => aggregateByCategory(categorySummaries), [categorySummaries]);
  const pmSummaries = useMemo(() => aggregateByPM(categories), [categories]);
  const pmMax = pmSummaries[0]?.total ?? 0;

  const totalRows = useMemo(() => summaries.reduce((s, x) => s + x.totalRows, 0), [summaries]);
  const syncedPages = summaries.filter(s => s.syncedAt).length;

  const platformData = useMemo(
    () => [...platformMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] })),
    [platformMap]
  );

  // Compact bucket-based status distribution (top items only)
  const statusBuckets = useMemo(() => ([
    { label: 'In progress', value: buckets.progress, color: '#2748e0' },
    { label: 'Live',        value: buckets.live,     color: '#059669' },
    { label: 'Review / QA', value: buckets.review,   color: '#0891b2' },
    { label: 'Design',      value: buckets.design,   color: '#7c3aed' },
    { label: 'On hold',     value: buckets.hold,     color: '#d97706' },
  ]), [buckets]);

  const statusTotal = buckets.progress + buckets.live + buckets.review + buckets.design + buckets.hold;

  if (!ready) return <div className="p-6 text-slate-500">Loading…</div>;

  const anySynced = summaries.some(s => s.syncedAt);
  const pageAccents = [
    'bg-gradient-to-b from-brand-500 to-brand-700',
    'bg-gradient-to-b from-emerald-400 to-emerald-600',
    'bg-gradient-to-b from-sky-400 to-sky-600',
    'bg-gradient-to-b from-violet-400 to-violet-600',
    'bg-gradient-to-b from-amber-400 to-amber-600',
    'bg-gradient-to-b from-rose-400 to-rose-600',
  ];

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="glass glass-strong relative overflow-hidden rounded-2xl p-5">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Dashboard</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-slate-200 px-2.5 py-1 text-[10.5px] font-medium text-slate-700 shadow-sm">
                <span className={`h-1.5 w-1.5 rounded-full ${lastSync ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                {syncedPages}/{summaries.length} synced
              </span>
            </div>
            <p className="mt-2 text-[12px] text-slate-600">
              Last activity <span className="text-slate-900 font-semibold">{relTime(lastSync)}</span>
              {lastSync && <span className="text-slate-400"> · {fmtTime(lastSync)}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/all-projects" className="inline-flex h-9 px-3.5 rounded-lg bg-white/50 backdrop-blur border border-white/60 text-slate-700 text-[12px] font-semibold hover:bg-white/70 items-center transition-colors shadow-sm">
              View all
            </Link>
            <Link href="/project" className="inline-flex h-9 px-3.5 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-[12px] font-semibold hover:from-brand-700 hover:to-brand-800 items-center shadow-md hover:shadow-lg transition-all">
              + New project
            </Link>
          </div>
        </div>
      </div>

      {!anySynced && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-50/50 px-4 py-3 text-[12px] text-amber-800 flex items-start gap-2 shadow-sm">
          <span className="mt-0.5">⚠️</span>
          <span>No project data loaded yet.</span>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <StatCard label="Total records" value={totalRows} sub={`across ${summaries.length} pages`} tone="brand"   icon={IconLayers} />
        <StatCard label="In progress"   value={buckets.progress} sub="active development"        tone="sky"     icon={IconPlay} />
        <StatCard label="Live"          value={buckets.live}     sub="deployed / launched"       tone="emerald" icon={IconCheck} />
        <StatCard label="Review / QA"   value={buckets.review}                                    tone="violet"  icon={IconEye} />
        <StatCard label="On hold"       value={buckets.hold}                                      tone="amber"   icon={IconPause} />
      </div>

      {/* Project managers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="glass rounded-2xl p-4 lg:col-span-12">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-900 tracking-tight">Project Managers</h2>
              <p className="mt-0.5 text-[10.5px] text-slate-500">Total projects managed</p>
            </div>
            <span className="text-[10.5px] text-slate-500">{pmSummaries.length}</span>
          </div>
          {pmSummaries.length === 0 ? (
            <div className="py-10 text-center text-[11.5px] italic text-slate-500">No PM data yet</div>
          ) : (
            <div className="space-y-0.5 max-h-[420px] overflow-y-auto pr-1">
              {pmSummaries.map(pm => (
                <PMRow key={pm.name} pm={pm} max={pmMax} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT column */}
        <div className="lg:col-span-8 space-y-4">
          {/* Per-page cards */}
          <section className="glass rounded-2xl p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-slate-900 tracking-tight">Pages</h2>
              <span className="text-[10.5px] text-slate-500">Click to open</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {summaries.map((s, i) => (
                <PageCard key={s.source.key} s={s} accent={pageAccents[i % pageAccents.length]} />
              ))}
            </div>
          </section>

          {/* Top platforms */}
          <section className="glass rounded-2xl p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-slate-900 tracking-tight">Top platforms</h2>
              <span className="text-[10.5px] text-slate-500">by rows</span>
            </div>
            {platformData.length === 0
              ? <div className="text-[11px] text-slate-500 py-8 text-center italic">No platform data</div>
              : <HBars data={platformData} />}
          </section>
        </div>

        {/* RIGHT column */}
        <div className="lg:col-span-4 space-y-4">
          {/* Status distribution — compact */}
          <section className="glass rounded-2xl p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-slate-900 tracking-tight">Status distribution</h2>
              <span className="text-[10.5px] text-slate-500">Top 5</span>
            </div>
            <CompactPipeline items={statusBuckets} total={statusTotal} />
          </section>

          {/* Sync summary card */}
          <section className="glass rounded-2xl p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-slate-900 tracking-tight">Sync activity</h2>
              <span className="text-[10.5px] text-slate-500">Latest per page</span>
            </div>
            <div className="space-y-1.5">
              {summaries.map((s, i) => {
                const fresh = s.syncedAt && (Date.now() - s.syncedAt) < 1000 * 60 * 60 * 24;
                return (
                  <Link
                    key={s.source.key}
                    href={s.source.href}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors"
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${pageAccents[i % pageAccents.length]}`} />
                    <span className="flex-1 text-[11.5px] font-medium text-slate-800 truncate group-hover:text-brand-700">
                      {s.source.label}
                    </span>
                    <span className="text-[10.5px] tabular-nums text-slate-500">{s.totalRows}</span>
                    {s.syncedAt ? (
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${fresh ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        <span className={`h-1 w-1 rounded-full ${fresh ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {relTime(s.syncedAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold bg-amber-50 text-amber-700">
                        none
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
