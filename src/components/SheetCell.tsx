'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

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
  className = '',
}: {
  /** Raw current value, used to seed the editor and detect a real change. */
  value: string;
  /** Persist the new value for this one cell. */
  onSave: (next: string) => void | Promise<void>;
  /** Rendered when not editing (link / PM button / plain text). */
  children: ReactNode;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const begin = () => { setDraft(value); setEditing(true); };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  const cancel = () => { setEditing(false); setDraft(value); };

  if (editing) {
    return (
      <td className={`px-3 py-2 align-middle ${className}`}>
        <input
          ref={inputRef}
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
