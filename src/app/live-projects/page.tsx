'use client';
import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import SheetSyncPanel from '@/components/SheetSyncPanel';
import { useSyncedTotal } from '@/lib/useSyncedTotal';

export default function LiveProjects() {
  const { projects, ready } = useStore();
  const syncedTotal = useSyncedTotal('live-projects');
  const live = useMemo(() =>
    projects.filter(p => /live|delivered/i.test(p.status || '') || (p.liveDate && new Date(p.liveDate).getTime() < Date.now())),
  [projects]);

  const recent = useMemo(() => {
    const now = Date.now();
    const in30 = 30 * 86400_000;
    return live.filter(p => p.liveDate && (now - new Date(p.liveDate).getTime()) < in30).length;
  }, [live]);

  const withSsl = useMemo(() =>
    live.filter(p => /active|valid|installed/i.test(p.sslStatus || '')).length, [live]);

  if (!ready) return <div className="p-6 text-slate-500">Loading…</div>;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-emerald-50/40 to-white p-5 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Live Projects</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-emerald-200 px-2.5 py-1 text-[10.5px] font-medium text-emerald-700 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {(syncedTotal || live.length)} in production
              </span>
            </div>
            <p className="mt-2 text-[12px] text-slate-600">Everything currently deployed and serving traffic.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniStat label="Total live" value={syncedTotal || live.length} tone="emerald" />
        <MiniStat label="Launched (30d)" value={recent} tone="brand" />
        <MiniStat label="SSL active" value={withSsl} tone="sky" />
      </div>

      <SheetSyncPanel pageKey="live-projects" title="Live Projects" />
    </div>
  );
}

type Tone = 'brand' | 'emerald' | 'sky';
const TONES: Record<Tone, { grad: string; ring: string; text: string }> = {
  brand:   { grad: 'from-brand-500/10 to-brand-500/0',     ring: 'ring-brand-500/20',   text: 'text-brand-700' },
  emerald: { grad: 'from-emerald-500/10 to-emerald-500/0', ring: 'ring-emerald-500/20', text: 'text-emerald-700' },
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
