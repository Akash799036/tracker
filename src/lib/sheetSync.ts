import type { AllProjectsSheet, SheetRow, SheetRowRecord, AllProjectsData } from './allProjectsTypes';

export type { AllProjectsSheet, SheetRow, SheetRowRecord, AllProjectsData };

export type SheetSyncPageKey =
  | 'projects'
  | 'live-projects'
  | 'priority-list'
  | 'maintenance-projects'
  | 'marketing'
  | 'all-projects'
  | 'dashboard';

// v2: rows became { uid, origin, cells } instead of a bare cell map. Bumping the
// key drops v1 payloads rather than letting the table read cells off the wrong
// shape and render blanks.
export const SHEET_SYNC_STORAGE_KEY = (key: SheetSyncPageKey) => `sheet-sync.${key}.v2`;

// Server-only: default Google Sheet ID per page. Override with env vars.
const ALL_PROJECTS_FALLBACK = process.env.ALL_PROJECTS_SHEET_ID || '1F1hcq7Fu3vLcqIt3d0Ns30iz26RjvZRw3lGeDkVhjTM';

export const PAGE_SHEET_IDS: Record<SheetSyncPageKey, string> = {
  'projects':             process.env.PROJECTS_SHEET_ID             || '1ui2V0BA6LDKT_rtX7S4B8TnNtFRtMEKoEBKGrhym5II',
  'live-projects':        process.env.LIVE_PROJECTS_SHEET_ID        || '1gJK-Czm-1uS5XriD3WTwr5mWW2Kp6FnOQnMpc6A6gmM',
  'priority-list':        process.env.PRIORITY_LIST_SHEET_ID        || '1h6QyFLz2q6TVNuTA7DhKvtiDaEONQrIYt8U8SH0dt-s',
  'maintenance-projects': process.env.MAINTENANCE_PROJECTS_SHEET_ID || process.env.MAINTENANCE_SHEET_ID || '1R5xPfKQpnIBskWWNKM81UMD-85hhzEOcll5QEBT8UtE',
  'marketing':            process.env.MARKETING_SHEET_ID            || '1RWGRBD9mivKY9JAWLCzLK1aR8NMUgxeyVRv06YW3_xs',
  'all-projects':         ALL_PROJECTS_FALLBACK,
  'dashboard':            process.env.DASHBOARD_SHEET_ID            || ALL_PROJECTS_FALLBACK,
};

export function isValidPageKey(v: string): v is SheetSyncPageKey {
  return v in PAGE_SHEET_IDS;
}

/**
 * Standardize heading / PM names:
 * - "Biswajit da" -> "Biswajit"
 * - "Sayanda" / "Sayan da" -> "Sayandip"
 */
export function formatHeadingName(name: string): string {
  if (!name) return name;
  let str = String(name).trim();
  str = str.replace(/\bbiswajit\s*da\b/gi, 'Biswajit');
  str = str.replace(/\b(sayanda|sayan\s*da)\b/gi, 'Sayandip');
  return str;
}
