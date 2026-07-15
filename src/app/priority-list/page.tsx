'use client';
import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import SheetSyncPanel from '@/components/SheetSyncPanel';
import { useSyncedTotal } from '@/lib/useSyncedTotal';

export default function PriorityList() {
  const { projects, ready } = useStore();
  const syncedTotal = useSyncedTotal('priority-list');
  const rows = useMemo(() => {
    const now = Date.now();
    const in14 = now + 14 * 86400_000;
    return projects
      .filter(p => {
        if (/hold|cancel/i.test(p.status || '')) return false;
        if (p.liveDate) {
          const t = new Date(p.liveDate).getTime();
          if (!isNaN(t) && t >= now && t <= in14) return true;
        }
        return /review|testing|development|design/i.test(p.status || '');
      })
      .sort((a, b) => new Date(a.liveDate || 0).getTime() - new Date(b.liveDate || 0).getTime());
  }, [projects]);

  const stats = useMemo(() => {
    const now = Date.now();
    const in7 = now + 7 * 86400_000;
    const in14 = now + 14 * 86400_000;
    const launchingThisWeek = rows.filter(p => {
      const t = p.liveDate ? new Date(p.liveDate).getTime() : NaN;
      return !isNaN(t) && t >= now && t <= in7;
    }).length;
    const launchingSoon = rows.filter(p => {
      const t = p.liveDate ? new Date(p.liveDate).getTime() : NaN;
      return !isNaN(t) && t >= now && t <= in14;
    }).length;
    return { total: rows.length, launchingThisWeek, launchingSoon };
  }, [rows]);

  if (!ready) return <div className="p-6 text-slate-500">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-rose-50/40 to-white p-5 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Priority Projects</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-rose-200 px-2.5 py-1 text-[10.5px] font-medium text-rose-700 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                {(syncedTotal || rows.length)} needs focus
              </span>
            </div>
            <p className="mt-2 text-[12px] text-slate-600">Launching in the next 14 days or actively in flight.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniStat label="In focus" value={syncedTotal || stats.total} tone="rose" />
        <MiniStat label="Launching ≤7 d" value={stats.launchingThisWeek} tone="amber" />
        <MiniStat label="Launching ≤14 d" value={stats.launchingSoon} tone="brand" />
      </div>

      <SheetSyncPanel pageKey="priority-list" title="Priority List — Google Sheet" />
    </div>
  );
}

type Tone = 'rose' | 'amber' | 'brand';
const TONES: Record<Tone, { grad: string; ring: string; text: string }> = {
  rose:  { grad: 'from-rose-500/10 to-rose-500/0',   ring: 'ring-rose-500/20',   text: 'text-rose-700' },
  amber: { grad: 'from-amber-500/10 to-amber-500/0', ring: 'ring-amber-500/20',  text: 'text-amber-700' },
  brand: { grad: 'from-brand-500/10 to-brand-500/0', ring: 'ring-brand-500/20',  text: 'text-brand-700' },
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
