import type { AllProjectsSheet, SheetRow, AllProjectsData } from './allProjectsTypes';

export type { AllProjectsSheet, SheetRow, AllProjectsData };

export type SheetSyncPageKey =
  | 'projects'
  | 'live-projects'
  | 'priority-list'
  | 'marketing'
  | 'dashboard';

export const SHEET_SYNC_STORAGE_KEY = (key: SheetSyncPageKey) => `sheet-sync.${key}.v1`;

// Server-only: default Google Sheet ID per page. Override with env vars.
const ALL_PROJECTS_FALLBACK = process.env.ALL_PROJECTS_SHEET_ID || '1F1hcq7Fu3vLcqIt3d0Ns30iz26RjvZRw3lGeDkVhjTM';

export const PAGE_SHEET_IDS: Record<SheetSyncPageKey, string> = {
  'projects':       process.env.PROJECTS_SHEET_ID       || '1ui2V0BA6LDKT_rtX7S4B8TnNtFRtMEKoEBKGrhym5II',
  'live-projects':  process.env.LIVE_PROJECTS_SHEET_ID  || '1gJK-Czm-1uS5XriD3WTwr5mWW2Kp6FnOQnMpc6A6gmM',
  'priority-list':  process.env.PRIORITY_LIST_SHEET_ID  || '1h6QyFLz2q6TVNuTA7DhKvtiDaEONQrIYt8U8SH0dt-s',
  'marketing':      process.env.MARKETING_SHEET_ID      || '1RWGRBD9mivKY9JAWLCzLK1aR8NMUgxeyVRv06YW3_xs',
  'dashboard':      process.env.DASHBOARD_SHEET_ID      || ALL_PROJECTS_FALLBACK,
};

export function isValidPageKey(v: string): v is SheetSyncPageKey {
  return v in PAGE_SHEET_IDS;
}
