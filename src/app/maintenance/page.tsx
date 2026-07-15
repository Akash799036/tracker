'use client';
import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import SheetSyncPanel from '@/components/SheetSyncPanel';
import { useSyncedTotal } from '@/lib/useSyncedTotal';

export default function MaintenancePage() {
  const { projects, ready } = useStore();
  const syncedTotal = useSyncedTotal('maintenance');
  const rows = useMemo(() =>
    projects.filter(p => p.maintenanceStart || p.maintenanceEnd)
      .sort((a, b) => new Date(a.maintenanceEnd || 0).getTime() - new Date(b.maintenanceEnd || 0).getTime()),
  [projects]);

  const stats = useMemo(() => {
    const now = Date.now();
    const in14 = now + 14 * 86400_000;
    const expiring = rows.filter(p => {
      const t = p.maintenanceEnd ? new Date(p.maintenanceEnd).getTime() : NaN;
      return !isNaN(t) && t >= now && t <= in14;
    }).length;
    const expired = rows.filter(p => {
      const t = p.maintenanceEnd ? new Date(p.maintenanceEnd).getTime() : NaN;
      return !isNaN(t) && t < now;
    }).length;
    return { total: rows.length, expiring, expired };
  }, [rows]);

  if (!ready) return <div className="p-6 text-slate-500">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-violet-50/40 to-white p-5 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Weekly / Maintenance</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-slate-200 px-2.5 py-1 text-[10.5px] font-medium text-slate-700 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                {(syncedTotal || rows.length)} on contract
              </span>
            </div>
            <p className="mt-2 text-[12px] text-slate-600">Projects on active maintenance windows — sorted by end date.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniStat label="Total contracts" value={syncedTotal || stats.total} tone="violet" />
        <MiniStat label="Expiring ≤14 d" value={stats.expiring} tone="amber" />
        <MiniStat label="Expired" value={stats.expired} tone="rose" />
      </div>

      <SheetSyncPanel pageKey="maintenance" title="Maintenance — Google Sheet" />
    </div>
  );
}

type Tone = 'violet' | 'amber' | 'rose';
const TONES: Record<Tone, { grad: string; ring: string; text: string }> = {
  violet: { grad: 'from-violet-500/10 to-violet-500/0', ring: 'ring-violet-500/20', text: 'text-violet-700' },
  amber:  { grad: 'from-amber-500/10 to-amber-500/0',   ring: 'ring-amber-500/20',  text: 'text-amber-700' },
  rose:   { grad: 'from-rose-500/10 to-rose-500/0',     ring: 'ring-rose-500/20',   text: 'text-rose-700' },
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
