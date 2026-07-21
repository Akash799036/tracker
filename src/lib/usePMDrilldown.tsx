'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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

  useEffect(() => {
    const refresh = () => setSummaries(readAllSummaries(CATEGORY_SOURCES));
    // The drill-down spans every workbook, not just this page's, so make sure
    // the cross-page cache is populated even on a cold first visit.
    hydrateFromServer().then(refresh);
    const onStorage = () => refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onStorage);
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
          onClick={e => { e.stopPropagation(); setOpenPM(name); }}
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
