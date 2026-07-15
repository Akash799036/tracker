'use client';

import { useEffect, useRef } from 'react';
import { SHEET_SYNC_STORAGE_KEY, type AllProjectsData, type SheetSyncPageKey } from '@/lib/sheetSync';
import { ALL_PROJECTS_STORAGE_KEY } from '@/lib/allProjectsTypes';

const PAGE_KEYS: SheetSyncPageKey[] = [
  'projects',
  'live-projects',
  'priority-list',
  'maintenance',
  'marketing',
  'dashboard',
];

async function syncOne(pageKey: SheetSyncPageKey) {
  try {
    const res = await fetch(`/api/sheet-sync/${pageKey}`, { cache: 'no-store' });
    if (!res.ok) return;
    const json = (await res.json()) as AllProjectsData;
    try {
      localStorage.setItem(SHEET_SYNC_STORAGE_KEY(pageKey), JSON.stringify(json));
      window.dispatchEvent(new CustomEvent('sheet-sync:updated', { detail: { pageKey } }));
    } catch {}
  } catch {}
}

async function syncAllProjects() {
  try {
    const res = await fetch('/api/all-projects/sync', { cache: 'no-store' });
    if (!res.ok) return;
    const json = (await res.json()) as AllProjectsData;
    try {
      localStorage.setItem(ALL_PROJECTS_STORAGE_KEY, JSON.stringify(json));
      window.dispatchEvent(new CustomEvent('sheet-sync:updated', { detail: { pageKey: 'all-projects' } }));
    } catch {}
  } catch {}
}

export default function AutoSheetSync() {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    PAGE_KEYS.forEach(syncOne);
    syncAllProjects();
  }, []);
  return null;
}
