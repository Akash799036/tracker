export type SheetRow = Record<string, string | number | boolean | null>;

export type AllProjectsSheet = {
  name: string;
  headers: string[];
  rows: SheetRow[];
};

export type AllProjectsData = {
  sheets: AllProjectsSheet[];
  syncedAt: number;
  source: 'google-sheets' | 'upload' | 'none';
  sourceName?: string;
};

export const ALL_PROJECTS_STORAGE_KEY = 'all-projects.v1';
