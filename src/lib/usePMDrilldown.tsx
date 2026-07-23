'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import PMProjectsModal from '@/components/PMProjectsModal';
import {
  CATEGORY_SOURCES,
  collectProjectsByPM,
  findPMHeader,
  hydrateFromServer,
  readAllSummaries,
  resolvePMName,
} from './dashboardAggregate';

/**
 * Makes Project Manager cells clickable in any sheet table.
 *
 * The tables render raw sheet cells, so this owns the whole lookup: which
 * header is the PM column, which canonical PM a raw cell resolves to, and the
 * modal itself. Returns `renderPMCell`, which falls back to plain text
 * whenever the value has no projects behind it — so an unknown or misspelled
 * name renders as before rather than as a dead button.
 */
export function usePMDrilldown(headers: string[]) {
  const [summaries, setSummaries] = useState(() => readAllSummaries(CATEGORY_SOURCES));
  const [openPM, setOpenPM] = useState<string | null>(null);
  const hydrated = useRef(false);

  // The drill-down spans every workbook, so building the full PM index needs the
  // cross-page cache. Pulling that on mount would make every table page fetch
  // all six sheets just to render — the very fan-out we want to avoid. Instead
  // fetch it lazily the first time a PM cell is actually clicked; until then the
  // page uses only whatever cross-page cache already sits in localStorage (from
  // pages the user has already visited). This keeps a plain page visit to a
  // single API call.
  const ensureHydrated = useCallback(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    hydrateFromServer().then(() => setSummaries(readAllSummaries(CATEGORY_SOURCES)));
  }, []);

  useEffect(() => {
    const refresh = () => setSummaries(readAllSummaries(CATEGORY_SOURCES));
    const onStorage = () => refresh();
    // Same-tab cache writes (e.g. the page's own SheetSyncPanel finishing its
    // fetch) don't fire a 'storage' event, so also refresh on the app's custom
    // update event. This keeps this page's PM cells clickable from its own data
    // without pulling every other sheet up front.
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onStorage);
    window.addEventListener('sheet-sync:updated', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onStorage);
      window.removeEventListener('sheet-sync:updated', onStorage);
    };
  }, []);

  const index = useMemo(() => collectProjectsByPM(summaries), [summaries]);
  const pmHeader = useMemo(() => findPMHeader(headers), [headers]);
  const activePM = openPM ? index.get(openPM) ?? null : null;

  const renderPMCell = useCallback(
    (header: string, value: unknown, fallback: ReactNode): ReactNode => {
      if (!pmHeader || header !== pmHeader) return fallback;
      const name = resolvePMName(value, index);
      if (!name) return fallback;
      return (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); ensureHydrated(); setOpenPM(name); }}
          title={`View ${name}'s projects`}
          className="font-medium text-black underline decoration-slate-400 decoration-dotted underline-offset-2 transition-colors hover:text-slate-700 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
        >
          {String(value)}
        </button>
      );
    },
    [pmHeader, index]
  );

  const pmModal = <PMProjectsModal pm={activePM} onClose={() => setOpenPM(null)} />;

  return { renderPMCell, pmModal };
}
