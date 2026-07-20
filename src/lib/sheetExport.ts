'use client';

import * as XLSX from 'xlsx';
import type { AllProjectsData, AllProjectsSheet, SheetRowRecord } from './allProjectsTypes';
import { type CustomField, type CustomFieldValue, type ValueMap, vkey } from './useCustomFields';
import { download } from './ui';

// Shared export routine for every sheet table (SheetSyncPanel and All Projects).
//
// Two scopes:
//   'tab'  — just the tab on screen, honouring the current search filter.
//   'page' — every tab on the page, unfiltered. For .xlsx that means one
//            worksheet per tab; for .csv, one file with a leading "Sheet"
//            column, since tabs don't share a column set.

export type ExportFormat = 'xlsx' | 'csv';
export type ExportScope = 'tab' | 'page';

/** A single tab flattened into plain header/row arrays, ready to serialise. */
type ExportTable = { name: string; headers: string[]; rows: Record<string, unknown>[] };

const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const cell = (v: unknown) => (v == null ? '' : String(v));
const slug = (s: string) => s.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();

/**
 * Excel rejects duplicate or over-long worksheet names, so clamp to 31 chars
 * and disambiguate collisions rather than letting the whole download fail.
 */
function safeSheetName(name: string, taken: Set<string>) {
  const base = (name.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet').slice(0, 31);
  let candidate = base;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** Merge a tab's custom-field columns into its rows. */
function buildTable(
  name: string,
  headers: string[],
  rows: SheetRowRecord[],
  fields: CustomField[],
  values: ValueMap
): ExportTable {
  return {
    name,
    headers: [...headers, ...fields.map(f => f.label)],
    rows: rows.map(r => {
      const merged: Record<string, unknown> = { ...r.cells };
      for (const f of fields) merged[f.label] = values[vkey(f.id, r.uid)] ?? '';
      return merged;
    }),
  };
}

/**
 * Fetch every tab's custom fields for a page in one request, grouped by sheet
 * name. Whole-page export needs the fields for tabs the user never opened, and
 * `useCustomFields` only ever holds the active tab's.
 */
async function fetchAllCustomFields(pageKey: string) {
  const bySheet = new Map<string, { fields: CustomField[]; values: ValueMap }>();
  try {
    const res = await fetch(`/api/custom-fields/${pageKey}`, { cache: 'no-store' });
    if (!res.ok) return bySheet;
    const json = await res.json();
    const values: ValueMap = {};
    for (const v of (json.values || []) as CustomFieldValue[]) {
      values[vkey(v.fieldId, v.rowUid)] = v.value;
    }
    for (const f of (json.fields || []) as CustomField[]) {
      const entry = bySheet.get(f.sheetName) ?? { fields: [], values };
      entry.fields.push(f);
      bySheet.set(f.sheetName, entry);
    }
    // The API returns fields already ordered by position, but it groups by page,
    // so re-sort within each sheet to be safe.
    for (const entry of bySheet.values()) entry.fields.sort((a, b) => a.position - b.position);
  } catch {
    /* export the sheet columns alone rather than failing outright */
  }
  return bySheet;
}

function writeCsv(tables: ExportTable[], baseName: string, withSheetColumn: boolean) {
  // Tabs have different column sets, so a combined CSV uses the union of all
  // headers (first-seen order) and tags each row with the tab it came from.
  const headers: string[] = [];
  for (const t of tables) for (const h of t.headers) if (!headers.includes(h)) headers.push(h);

  const columns = withSheetColumn ? ['Sheet', ...headers] : headers;
  const lines = [columns.map(esc).join(',')];
  for (const t of tables) {
    for (const r of t.rows) {
      const values = headers.map(h => esc(r[h]));
      lines.push(withSheetColumn ? [esc(t.name), ...values].join(',') : values.join(','));
    }
  }
  download(`${baseName}.csv`, lines.join('\n'), 'text/csv');
}

function writeXlsx(tables: ExportTable[], baseName: string) {
  const wb = XLSX.utils.book_new();
  const taken = new Set<string>();
  for (const t of tables) {
    const aoa: string[][] = [t.headers.slice()];
    for (const r of t.rows) aoa.push(t.headers.map(h => cell(r[h])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), safeSheetName(t.name, taken));
  }
  XLSX.writeFile(wb, `${baseName}.xlsx`);
}

export type ExportRequest = {
  format: ExportFormat;
  scope: ExportScope;
  /** Page key for the custom-fields API; also the filename prefix. */
  pageKey: string;
  /** Filename prefix, when it should differ from the page key. */
  fileprefix?: string;
  data: AllProjectsData | null;
  /** The tab on screen — the only one exported when scope is 'tab'. */
  sheet: AllProjectsSheet | undefined;
  /** Active tab's headers in on-screen (reordered) order. */
  headers: string[];
  /** Active tab's rows after the search filter. */
  filteredRows: SheetRowRecord[];
  /** Active tab's custom fields, already loaded by useCustomFields. */
  customFields: CustomField[];
  customValues: ValueMap;
};

/**
 * Build and download the requested export. Async only because a whole-page
 * export has to fetch the other tabs' custom fields first.
 */
export async function exportSheetData(req: ExportRequest): Promise<void> {
  const {
    format, scope, pageKey, fileprefix = pageKey,
    data, sheet, headers, filteredRows, customFields, customValues,
  } = req;

  if (scope === 'tab') {
    if (!sheet) return;
    const table = buildTable(sheet.name, headers, filteredRows, customFields, customValues);
    const baseName = slug(`${fileprefix}-${sheet.name}`);
    if (format === 'csv') writeCsv([table], baseName, false);
    else writeXlsx([table], baseName);
    return;
  }

  const sheets = data?.sheets ?? [];
  if (!sheets.length) return;

  const fieldsBySheet = await fetchAllCustomFields(pageKey);
  const tables = sheets.map(s => {
    // The active tab keeps its on-screen column order and its already-loaded
    // fields; the rest fall back to the stored order from the server.
    const isActive = s.name === sheet?.name;
    const cf = fieldsBySheet.get(s.name);
    return buildTable(
      s.name,
      isActive ? headers : s.headers,
      s.rows,
      isActive ? customFields : (cf?.fields ?? []),
      isActive ? customValues : (cf?.values ?? {})
    );
  });

  const baseName = slug(`${fileprefix}-all-tabs`);
  if (format === 'csv') writeCsv(tables, baseName, true);
  else writeXlsx(tables, baseName);
}
