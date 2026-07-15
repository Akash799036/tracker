'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import SheetSyncPanel from '@/components/SheetSyncPanel';
import { useSyncedTotal } from '@/lib/useSyncedTotal';

export default function ProjectsPage() {
  const { projects, ready } = useStore();
  const syncedTotal = useSyncedTotal('projects');
  const totalCount = syncedTotal || projects.length;

  const stats = useMemo(() => {
    const active = projects.filter(p => /progress|development|design|review|testing/i.test(p.status || '')).length;
    const hold = projects.filter(p => /hold/i.test(p.status || '')).length;
    const live = projects.filter(p => /live|delivered/i.test(p.status || '')).length;
    return { total: projects.length, active, hold, live };
  }, [projects]);

  if (!ready) return <div className="p-6 text-slate-500">Loading…</div>;

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-brand-50/40 to-white p-5 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Ongoing Projects</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-slate-200 px-2.5 py-1 text-[10.5px] font-medium text-slate-700 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
                {totalCount} total
              </span>
            </div>
            <p className="mt-2 text-[12px] text-slate-600">Track everything currently in flight across your teams.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/project" className="inline-flex h-9 px-3.5 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-[12px] font-semibold hover:from-brand-700 hover:to-brand-800 items-center shadow-md hover:shadow-lg transition-all">
              + New Project
            </Link>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Total" value={totalCount} tone="brand" />
        <MiniStat label="Active" value={stats.active} tone="sky" />
        <MiniStat label="Live" value={stats.live} tone="emerald" />
        <MiniStat label="On hold" value={stats.hold} tone="amber" />
      </div>

      <SheetSyncPanel pageKey="projects" title="Ongoing Projects — Google Sheet" />
    </div>
  );
}

type Tone = 'brand' | 'emerald' | 'amber' | 'sky';
const TONES: Record<Tone, { grad: string; ring: string; text: string }> = {
  brand:   { grad: 'from-brand-500/10 to-brand-500/0',     ring: 'ring-brand-500/20',   text: 'text-brand-700' },
  emerald: { grad: 'from-emerald-500/10 to-emerald-500/0', ring: 'ring-emerald-500/20', text: 'text-emerald-700' },
  amber:   { grad: 'from-amber-500/10 to-amber-500/0',     ring: 'ring-amber-500/20',   text: 'text-amber-700' },
  sky:     { grad: 'from-sky-500/10 to-sky-500/0',         ring: 'ring-sky-500/20',     text: 'text-sky-700' },
};

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
