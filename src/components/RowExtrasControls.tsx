'use client';

import { useEffect, useRef, useState } from 'react';
import type { RowExtra } from '@/lib/useRowExtras';

// Per-row ad-hoc fields, rendered as a chip in a trailing column that opens a
// popover listing that row's key/value pairs.
//
// Not columns: extras are sparse and differ row to row, so a column per distinct
// label would produce a wide, mostly-empty table — and would blur into the
// sheet-wide custom fields, which ARE columns. Keeping the two visually distinct
// is what lets a user tell "a field for every row" from "a note on this row".

export function RowExtrasCell({
  rowUid,
  extras,
  onAdd,
  onSetValue,
  onRename,
  onDelete,
  busy,
  className = '',
}: {
  rowUid: string;
  extras: RowExtra[];
  onAdd: (rowUid: string, label: string, value: string) => Promise<boolean>;
  onSetValue: (rowUid: string, label: string, value: string) => void;
  onRename: (rowUid: string, oldLabel: string, newLabel: string) => Promise<boolean>;
  onDelete: (rowUid: string, label: string) => void;
  busy?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  // Close on an outside click or Escape, like any other popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (open) labelRef.current?.focus(); }, [open]);

  const submit = async () => {
    if (!label.trim()) return;
    const ok = await onAdd(rowUid, label, value);
    if (ok) { setLabel(''); setValue(''); labelRef.current?.focus(); }
  };

  const count = extras.length;

  return (
    // While the popover is open the whole cell is lifted. A sticky cell forms
    // its own stacking context, so a z-index on the popover alone leaves it
    // painted under the neighbouring sticky columns and the rows below. The
    // z-index goes on the cell without touching `position`, which the caller
    // may have set to sticky.
    <td
      className={`px-3 py-2 align-middle border-b border-slate-100 ${className}`}
      style={open ? { zIndex: 40 } : undefined}
    >
      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          title={count ? `${count} extra field${count === 1 ? '' : 's'}` : 'Add a field to this row'}
          className={`h-7 px-2 inline-flex items-center gap-1 rounded-full border text-xs font-medium whitespace-nowrap ${
            count
              ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
              : 'border-dashed border-slate-300 text-slate-500 hover:border-amber-300 hover:text-amber-700'
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {count ? count : 'Field'}
        </button>

        {open && (
          <div className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-slate-300 bg-white shadow-xl ring-1 ring-black/5 p-3 space-y-2 text-left">
            <p className="text-xs font-semibold text-slate-700">Fields on this row</p>

            {extras.length === 0 && (
              <p className="text-xs text-slate-500">
                No extra fields yet. Add one below — it applies to this row only.
              </p>
            )}

            {extras.map(ex => (
              <div key={ex.id} className="flex items-center gap-1.5">
                {renaming === ex.label ? (
                  <input
                    autoFocus
                    defaultValue={ex.label}
                    onBlur={async e => {
                      const next = e.target.value.trim();
                      setRenaming(null);
                      if (next && next !== ex.label) await onRename(rowUid, ex.label, next);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    className="w-24 shrink-0 px-1.5 py-1 rounded border border-amber-400 text-xs"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setRenaming(ex.label)}
                    title="Rename this field"
                    className="w-24 shrink-0 text-left text-xs font-medium text-slate-600 truncate hover:text-amber-700"
                  >{ex.label}</button>
                )}
                <input
                  // Uncontrolled so typing never round-trips; the key remounts it
                  // when the stored value changes underneath.
                  defaultValue={ex.value}
                  key={ex.value}
                  onBlur={e => {
                    const next = e.target.value;
                    if (next !== ex.value) onSetValue(rowUid, ex.label, next);
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  placeholder="—"
                  aria-label={ex.label}
                  className="flex-1 min-w-0 px-1.5 py-1 rounded border border-slate-200 focus:border-amber-400 text-xs"
                />
                <button
                  type="button"
                  onClick={() => onDelete(rowUid, ex.label)}
                  aria-label={`Remove ${ex.label}`}
                  title="Remove this field from the row"
                  className="shrink-0 text-slate-400 hover:text-rose-600"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}

            <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5">
              <input
                ref={labelRef}
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                placeholder="Field"
                aria-label="New field name"
                className="w-24 shrink-0 px-1.5 py-1 rounded border border-slate-300 text-xs"
              />
              <input
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                placeholder="Value"
                aria-label="New field value"
                className="flex-1 min-w-0 px-1.5 py-1 rounded border border-slate-300 text-xs"
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy || !label.trim()}
                className="shrink-0 h-7 px-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
              >Add</button>
            </div>
          </div>
        )}
      </div>
    </td>
  );
}
