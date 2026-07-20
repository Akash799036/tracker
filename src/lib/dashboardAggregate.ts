import {
  SHEET_SYNC_STORAGE_KEY,
  type AllProjectsData,
  type SheetRow,
  type SheetSyncPageKey,
} from './sheetSync';
import { ALL_PROJECTS_STORAGE_KEY } from './allProjectsTypes';

export type DashboardSourceKey =
  | 'all-projects'
  | 'live-projects'
  | 'projects'
  | 'priority-list'
  | 'marketing';

export type DashboardSource = {
  key: DashboardSourceKey;
  label: string;
  href: string;
  storageKey: string;
};

export const DASHBOARD_SOURCES: DashboardSource[] = [
  { key: 'all-projects',  label: 'All Projects',      href: '/all-projects',  storageKey: ALL_PROJECTS_STORAGE_KEY },
  { key: 'live-projects', label: 'Live Projects',     href: '/live-projects', storageKey: SHEET_SYNC_STORAGE_KEY('live-projects' as SheetSyncPageKey) },
  { key: 'projects',      label: 'Ongoing Projects',  href: '/projects',      storageKey: SHEET_SYNC_STORAGE_KEY('projects' as SheetSyncPageKey) },
  { key: 'priority-list', label: 'Priority Projects', href: '/priority-list', storageKey: SHEET_SYNC_STORAGE_KEY('priority-list' as SheetSyncPageKey) },
  { key: 'marketing',     label: 'Marketing Projects',href: '/marketing',     storageKey: SHEET_SYNC_STORAGE_KEY('marketing' as SheetSyncPageKey) },
];

export type PageSummary = {
  source: DashboardSource;
  data: AllProjectsData | null;
  totalRows: number;
  syncedAt: number | null;
  sheetCount: number;
};

function readCache(key: string): AllProjectsData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AllProjectsData) : null;
  } catch { return null; }
}

function totalRows(data: AllProjectsData | null): number {
  if (!data) return 0;
  return data.sheets.reduce((s, sh) => s + sh.rows.length, 0);
}

export function readAllSummaries(): PageSummary[] {
  return DASHBOARD_SOURCES.map(source => {
    const data = readCache(source.storageKey);
    return {
      source,
      data,
      totalRows: totalRows(data),
      syncedAt: data?.syncedAt ?? null,
      sheetCount: data?.sheets.length ?? 0,
    };
  });
}

const STATUS_KEYS = ['status', 'project status', 'current status', 'stage'];
const PLATFORM_KEYS = ['platform', 'technology', 'tech', 'stack', 'type'];

function findKey(row: SheetRow, candidates: string[]): string | null {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const hit = keys.find(k => k.trim().toLowerCase() === c);
    if (hit) return hit;
  }
  for (const c of candidates) {
    const hit = keys.find(k => k.trim().toLowerCase().includes(c));
    if (hit) return hit;
  }
  return null;
}

function bumpCount(map: Map<string, number>, raw: unknown) {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return;
  map.set(s, (map.get(s) || 0) + 1);
}

export function aggregateColumn(summaries: PageSummary[], candidates: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const sum of summaries) {
    if (!sum.data) continue;
    for (const sheet of sum.data.sheets) {
      if (!sheet.rows.length) continue;
      const key = findKey(sheet.rows[0].cells, candidates);
      if (!key) continue;
      for (const row of sheet.rows) bumpCount(map, row.cells[key]);
    }
  }
  return map;
}

export function aggregateStatus(summaries: PageSummary[]) {
  return aggregateColumn(summaries, STATUS_KEYS);
}

export function aggregatePlatform(summaries: PageSummary[]) {
  return aggregateColumn(summaries, PLATFORM_KEYS);
}

export function classifyStatuses(map: Map<string, number>) {
  let progress = 0, live = 0, hold = 0, review = 0, design = 0, other = 0, total = 0;
  for (const [label, value] of map.entries()) {
    total += value;
    const s = label.toLowerCase();
    if (s === 'live' || s.includes('deploy') || s.includes('launched')) live += value;
    else if (s.includes('hold') || s.includes('pause')) hold += value;
    else if (s.includes('review') || s.includes('test') || s.includes('qa')) review += value;
    else if (s.includes('design')) design += value;
    else if (s.includes('progress') || s.includes('development') || s.includes('ongoing') || s.includes('active')) progress += value;
    else other += value;
  }
  return { total, progress, live, hold, review, design, other };
}
