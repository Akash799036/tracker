'use client';

import * as XLSX from 'xlsx';
import type { AllProjectsData, AllProjectsSheet, SheetRowRecord } from './allProjectsTypes';
import { download, getCleanFileName, getScopeFileUrl } from './ui';
import { isDriveOrScopeHeader } from './types';
import { WEBSITE_DELIVERY_PAGE_KEY, WEBSITE_DELIVERY_FIELDS } from './websiteDeliveryForm';

// Cell keys (field names) of encrypted fields on the Website Delivery form. These
// columns are excluded from every export so secrets never land in a CSV/XLSX.
const WEBSITE_DELIVERY_ENC_KEYS = new Set(
  WEBSITE_DELIVERY_FIELDS.filter(f => f.encrypted).map(f => f.name)
);

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

const toFullUrl = (url: string) => {
  if (url.startsWith('/')) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${url}`;
  }
  return url;
};

const esc = (v: unknown) => {
  if (v == null) return '""';
  const s = String(v).trim();
  if (/^(https?:\/\/|\/uploads\/)/i.test(s)) {
    const fullUrl = toFullUrl(s);
    const label = getCleanFileName(s);
    return `"=HYPERLINK(""${fullUrl.replace(/"/g, '""')}"", ""${label.replace(/"/g, '""')}"")"`;
  }
  return `"${s.replace(/"/g, '""')}"`;
};

const cell = (v: unknown) => {
  if (v == null) return '';
  const s = String(v).trim();
  if (/^(https?:\/\/|\/uploads\/)/i.test(s)) {
    const fullUrl = toFullUrl(s);
    return { v: fullUrl, t: 's', l: { Target: fullUrl } } as any;
  }
  return s;
};

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

/** Flatten a tab's headers and rows into the export shape. */
function buildTable(
  name: string,
  headers: string[],
  rows: SheetRowRecord[]
): ExportTable {
  return {
    name,
    headers: [...headers],
    rows: rows.map(r => ({ ...r.cells })),
  };
}

function writeCsv(tables: ExportTable[], baseName: string, withSheetColumn: boolean) {
  // Tabs have different column sets, so a combined CSV uses the union of all
  // headers (first-seen order) and tags each row with the tab it came from.
  const headers: string[] = [];
  for (const t of tables) for (const h of t.headers) if (!headers.includes(h)) headers.push(h);

  const columns = withSheetColumn ? ['Sheet', ...headers] : headers;
  const lines = [columns.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];
  for (const t of tables) {
    for (const r of t.rows) {
      const projectName = String(r['Project name'] || r['Project Name'] || r['project'] || '').trim();
      const values = headers.map(h => {
        const v = r[h];
        if (v == null || v === '') return '""';
        const s = String(v).trim();
        if (isDriveOrScopeHeader(h)) {
          const targetUrl = getScopeFileUrl(s, projectName);
          const fullUrl = toFullUrl(targetUrl);
          const label = projectName || getCleanFileName(s);
          return `"=HYPERLINK(""${fullUrl.replace(/"/g, '""')}"", ""${label.replace(/"/g, '""')}"")"`;
        }
        return esc(s);
      });
      lines.push(withSheetColumn ? [`"${t.name.replace(/"/g, '""')}"`, ...values].join(',') : values.join(','));
    }
  }
  download(`${baseName}.csv`, lines.join('\n'), 'text/csv');
}

function writeXlsx(tables: ExportTable[], baseName: string) {
  const wb = XLSX.utils.book_new();
  const taken = new Set<string>();
  for (const t of tables) {
    const aoa: any[][] = [t.headers.slice()];
    for (const r of t.rows) {
      const projectName = String(r['Project name'] || r['Project Name'] || r['project'] || '').trim();
      aoa.push(
        t.headers.map(h => {
          const v = r[h];
          if (v == null || v === '') return '';
          const s = String(v).trim();
          if (isDriveOrScopeHeader(h)) {
            const targetUrl = getScopeFileUrl(s, projectName);
            const fullUrl = toFullUrl(targetUrl);
            const label = projectName || getCleanFileName(s);
            return { v: label, t: 's', l: { Target: fullUrl } };
          }
          return cell(v);
        })
      );
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), safeSheetName(t.name, taken));
  }
  XLSX.writeFile(wb, `${baseName}.xlsx`);
}

export type ExportRequest = {
  format: ExportFormat;
  scope: ExportScope;
  /** Page key; also the default filename prefix. */
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
};

/** Build and download the requested export. */
export async function exportSheetData(req: ExportRequest): Promise<void> {
  const {
    format, scope, pageKey, fileprefix = pageKey,
    data, sheet, headers, filteredRows,
  } = req;

  // On the Website Delivery page, drop encrypted columns from any export so
  // secrets (passwords, cPanel/VPS logins) never leave in a CSV/XLSX.
  const visibleHeaders = (hs: string[]) =>
    pageKey === WEBSITE_DELIVERY_PAGE_KEY
      ? hs.filter(h => !WEBSITE_DELIVERY_ENC_KEYS.has(h))
      : hs;

  if (scope === 'tab') {
    if (!sheet) return;
    const table = buildTable(sheet.name, visibleHeaders(headers), filteredRows);
    const baseName = slug(`${fileprefix}-${sheet.name}`);
    if (format === 'csv') writeCsv([table], baseName, false);
    else writeXlsx([table], baseName);
    return;
  }

  const sheets = data?.sheets ?? [];
  if (!sheets.length) return;

  const tables = sheets.map(s =>
    // The active tab keeps its on-screen column order; the rest use the stored
    // order from the server.
    buildTable(s.name, visibleHeaders(s.name === sheet?.name ? headers : s.headers), s.rows)
  );

  const baseName = slug(`${fileprefix}-all-tabs`);
  if (format === 'csv') writeCsv(tables, baseName, true);
  else writeXlsx(tables, baseName);
}
