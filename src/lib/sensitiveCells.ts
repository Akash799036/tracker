import type { AllProjectsData } from './sheetSync';

/**
 * Strip third-party credentials from sheet data before it reaches a caller who
 * is not logged in.
 *
 * The project pages are public by design, but the workbook stores client site
 * logins in ordinary columns — 'Password', 'Admin', 'Admin Access' and
 * 'FTP/Cpanel Creds.' — which get written to sheet_rows.cells verbatim by the
 * seeder. Serving those routes unauthenticated meant `GET
 * /api/sheet-sync/dashboard` returned 99 cleartext passwords to anyone with the
 * URL. Rather than gate the pages (which would break public browsing), the
 * routes keep every row and blank only these cells for anonymous callers.
 *
 * Matching is by pattern, not an exact header list: the same concept is spelled
 * 'Admin', 'Admin Access' and 'Editor Access' across different tabs, and a new
 * tab could add another variant. Over-redacting a column for logged-out users
 * is a far cheaper mistake than leaking one, so the patterns are deliberately
 * broad.
 */
const SENSITIVE_HEADER = [
  /pass/i,        // Password, Passwd, Site Password
  /\bpwd\b/i,
  /cred/i,        // FTP/Cpanel Creds.
  /\bftp\b/i,
  /cpanel/i,
  /\badmin\b/i,   // Admin, Admin Access
  /editor\s*access/i,
  /\blogin\b/i,
  /api[\s_-]*key/i,
  /\btoken\b/i,
  /\bsecret\b/i,
];

/** True when a column header names something that must not be public. */
export function isSensitiveHeader(header: string): boolean {
  return SENSITIVE_HEADER.some(re => re.test(header));
}

/**
 * Blank every sensitive cell in a payload, leaving structure intact.
 *
 * Headers are kept and cells are emptied rather than deleted, so the table
 * still renders the same columns in the same order — a logged-out visitor sees
 * the project with an empty Password cell, not a differently-shaped table.
 * Returns a new object; the input (which may be a cached DB result) is not
 * mutated.
 */
export function redactSensitiveCells(data: AllProjectsData): AllProjectsData {
  return {
    ...data,
    sheets: data.sheets.map(sheet => ({
      ...sheet,
      // Keyed off each row's own cells, not sheet.headers: a row can carry a
      // key the header list omits (user-added rows, custom fields), and those
      // must be redacted too. Missing one here is a leak, so trust the data.
      rows: sheet.rows.map(row => {
        let touched = false;
        const cells = { ...row.cells };
        for (const key of Object.keys(cells)) {
          if (!isSensitiveHeader(key)) continue;
          if (cells[key] == null || cells[key] === '') continue;
          cells[key] = '';
          touched = true;
        }
        return touched ? { ...row, cells } : row;
      }),
    })),
  };
}
