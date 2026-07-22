// Shared helpers for the date-picker cells.
//
// Sheet columns carry no type metadata — a column is "a date column" purely by
// what its header is called (e.g. "Start Date", "Live Date", "Deadline"). These
// helpers let every editable surface (SheetCell, CustomFieldCell, the Add Row
// form, the whole-row edit inputs) agree on which columns get a calendar picker
// and how a stored value maps to/from the native <input type="date"> format.

// Matched case-insensitively against the header. Kept deliberately broad so the
// common project-tracker date columns light up without per-sheet configuration.
const DATE_HEADER_RE =
  /\b(date|deadline|due|start|end|eta|expiry|expiration|approval|go[\s-]?live|launch|delivery|timeline|milestone|d\.o\.b|dob|birthday|joining|onboard(?:ing|ed)?|(?:working|last)[\s-]?day)\b/i;

/** True when a column, identified only by its header text, should use a date picker. */
export function isDateHeader(header: string): boolean {
  return DATE_HEADER_RE.test(header || '');
}

// The value stored for a date cell may have arrived from a spreadsheet in any of
// several shapes: an ISO `YYYY-MM-DD`, a `DD/MM/YYYY` / `MM-DD-YYYY`, or an Excel
// serial number. `<input type="date">` only accepts `YYYY-MM-DD`, so normalise
// on the way in. Returns '' when the value can't be understood as a date, which
// leaves the picker blank rather than guessing.
export function toDateInputValue(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';

  // Already ISO (the format we persist).
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY, MM-DD-YYYY, DD.MM.YYYY and friends. When the first field is
  // clearly a month (>12 in the second field) we swap, matching seed.ts.
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    let a = +m[1], b = +m[2];
    const y = +m[3];
    if (b > 12 && a <= 12) [a, b] = [b, a];
    return iso(y, b, a);
  }

  // Excel serial dates (days since 1899-12-30). Only treat bare integers in a
  // plausible range as serials, so a stray "5" isn't turned into a date.
  if (/^\d{5}$/.test(s)) {
    const serial = +s;
    const ms = (serial - 25569) * 86400000; // 25569 = days from 1899-12-30 to epoch
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }

  return '';
}

function iso(y: number, mo: number, d: number): string {
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
