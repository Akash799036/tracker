export type SheetRow = Record<string, string | number | boolean | null>;

/**
 * A row as the API serves it. `uid` is the stable identity that custom-field
 * values and per-row extras hang off — it survives a re-sync, unlike the row's
 * position. `cells` already has any user edit merged over the synced values.
 *
 *   origin 'sheet' — came from the Google workbook; the seeder may update it.
 *   origin 'user'  — added through the UI; the seeder never touches it.
 */
export type SheetRowRecord = {
  uid: string;
  origin: 'sheet' | 'user';
  hidden?: boolean;
  cells: SheetRow;
};

export type AllProjectsSheet = {
  name: string;
  headers: string[];
  rows: SheetRowRecord[];
};

/**
 * A sheet as parsed straight out of a workbook, before it has been stored and
 * given row identities. Only the sync/upload routes handle this shape; anything
 * the UI sees is an AllProjectsSheet.
 */
export type RawSheet = {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
};

export type AllProjectsData = {
  sheets: AllProjectsSheet[];
  syncedAt: number;
  source: 'google-sheets' | 'upload' | 'none';
  sourceName?: string;
};

export const ALL_PROJECTS_STORAGE_KEY = 'all-projects.v1';

// The all-projects workbook is stored under the "dashboard" page key (seeded by
// scripts/seed-sheets.mjs). The page's rows AND its custom fields must both use
// this key — scoping fields to 'all-projects' while reading rows from 'dashboard'
// left the two pointing at different pages, and any page-scoped authorization
// guard would reject every write.
export const ALL_PROJECTS_PAGE_KEY = 'dashboard';
