'use client';

/**
 * Full-panel loading indicator shown while a page is fetching its data.
 *
 * Every data page paints this while its network load is in flight and swaps it
 * for the real content only once the data has arrived, so a slow fetch (e.g. the
 * All Projects sheet) never flashes an empty page. The spinner mirrors the one
 * in AppShell so the two read as the same app.
 */
export default function PageLoader({ label = 'Loading your data…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-[60vh] place-items-center px-6 py-20"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand-600 animate-spin" />
        </div>
        <div className="text-sm font-medium text-slate-600">{label}</div>
      </div>
    </div>
  );
}
