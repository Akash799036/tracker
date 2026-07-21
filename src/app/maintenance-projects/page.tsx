'use client';
import SheetSyncPanel from '@/components/SheetSyncPanel';
import { useSyncedTotal } from '@/lib/useSyncedTotal';

export default function MaintenanceProjectsPage() {
  return <MaintenanceProjects />;
}

function MaintenanceProjects() {
  const syncedTotal = useSyncedTotal('maintenance-projects');

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-amber-50/40 to-white p-5 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Maintenance Projects</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-amber-200 px-2.5 py-1 text-[10.5px] font-medium text-amber-700 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                {syncedTotal || 0} project{syncedTotal === 1 ? '' : 's'}
              </span>
            </div>
            <p className="mt-2 text-[12px] text-slate-600">Track and manage ongoing website maintenance & support contracts.</p>
          </div>
        </div>
      </div>

      <SheetSyncPanel pageKey="maintenance-projects" title="Maintenance Projects" />
    </div>
  );
}
