'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isDateHeader, toDateInputValue } from '@/lib/dateField';

// Double-click-to-edit cell for a synced sheet value.
//
// Displays `children` (a URL link, a PM drill-down button or plain text — the
// parent decides). A single click only *selects* the cell (a visible focus
// ring); a double click swaps the display for an input. This mirrors how a
// spreadsheet behaves, so a stray click never clobbers a value. The edit
// commits on blur or Enter and is discarded on Escape.
//
// A single cell PATCHes just its own header via `onSave`; there is no row-level
// "edit mode" to enter first.

export function SheetCell({
  value,
  onSave,
  children,
  header = '',
  className = '',
}: {
  /** Raw current value, used to seed the editor and detect a real change. */
  value: string;
  /** Persist the new value for this one cell. */
  onSave: (next: string) => void | Promise<void>;
  /** Rendered when not editing (link / PM button / plain text). */
  children: ReactNode;
  /** Column header — a date column swaps the text input for a calendar picker. */
  header?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDate = isDateHeader(header);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const begin = () => {
    // A date column seeds the picker from the normalised value so the calendar
    // opens on the stored date even if it was stored in another format.
    setDraft(isDate ? toDateInputValue(value) : value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    // For a date column the draft is normalised ISO, so compare it against the
    // normalised original rather than the raw stored text — otherwise a value
    // stored as e.g. "01/02/2025" would look "changed" and re-save every time.
    const baseline = isDate ? toDateInputValue(value) : value;
    if (draft !== baseline) onSave(draft);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(isDate ? toDateInputValue(value) : value);
  };

  if (editing) {
    return (
      <td className={`px-3 py-2 align-middle ${className}`}>
        <input
          ref={inputRef}
          type={isDate ? 'date' : 'text'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          className="w-full min-w-[8rem] px-2 py-1 rounded border border-indigo-400 focus:outline-none text-sm bg-white"
        />
      </td>
    );
  }

  return (
    <td
      // A single click does nothing; only a double click opens the editor, so a
      // casual click can never overwrite a value.
      onDoubleClick={begin}
      title="Double-click to edit"
      className={`px-3 py-2 align-middle whitespace-nowrap max-w-[28rem] truncate cursor-default ${className}`}
    >
      {/* An empty value would collapse to an unclickable sliver, so show a faint
          dash as the hit target — same convention as CustomFieldCell. */}
      {value === '' ? <span className="text-slate-300">—</span> : children}
    </td>
  );
}
