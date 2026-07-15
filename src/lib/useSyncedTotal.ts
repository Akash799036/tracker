'use client';

import { useEffect, useState } from 'react';
import { SHEET_SYNC_STORAGE_KEY, type AllProjectsData, type SheetSyncPageKey } from './sheetSync';
import { ALL_PROJECTS_STORAGE_KEY } from './allProjectsTypes';

type Key = SheetSyncPageKey | 'all-projects';

function storageKeyFor(key: Key): string {
  return key === 'all-projects' ? ALL_PROJECTS_STORAGE_KEY : SHEET_SYNC_STORAGE_KEY(key);
}

function readTotal(key: Key): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(storageKeyFor(key));
    if (!raw) return 0;
    const data = JSON.parse(raw) as AllProjectsData;
    return data.sheets.reduce((s, sh) => s + sh.rows.length, 0);
  } catch {
    return 0;
  }
}

export function useSyncedTotal(key: Key): number {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setTotal(readTotal(key));
    const refresh = () => setTotal(readTotal(key));
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { pageKey?: string } | undefined;
      if (!detail?.pageKey || detail.pageKey === key) refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKeyFor(key)) refresh();
    };
    window.addEventListener('sheet-sync:updated', onUpdated as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('sheet-sync:updated', onUpdated as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);
  return total;
}
