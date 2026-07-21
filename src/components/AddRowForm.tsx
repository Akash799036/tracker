'use client';

import { useEffect, useRef, useState } from 'react';
import { isDateHeader } from '@/lib/dateField';

// Toolbar button + inline row for adding a new record to a sheet.
//
// Rendered as a <tr> inside the table body so the inputs line up with the
// columns they fill. Styling hooks are props, following CustomFieldControls, so
// all-projects can restyle without forking the component.

export function AddRowButton({
  onClick,
  disabled,
  label = 'Add Row',
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-dashed border-emerald-300 text-xs font-semibold text-emerald-700 bg-emerald-50/50 hover:bg-emerald-50 disabled:opacity-50"
      title="Add a new row to this sheet"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      {label}
    </button>
  );
}

export function AddRowFormRow({
  headers,
  trailingCols,
  busy,
  onSave,
  onCancel,
  cellClassName = '',
}: {
  headers: string[];
  /** Extra <td>s to emit so the form spans the full table width. */
  trailingCols: number;
  busy?: boolean;
  onSave: (cells: Record<string, string>) => Promise<boolean> | boolean;
  onCancel: () => void;
  cellClassName?: string;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const submit = async () => {
    if (busy) return;
    const ok = await onSave(draft);
    if (ok) setDraft({});
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <tr className="bg-emerald-50/40 border-t-2 border-emerald-200">
      {headers.map((h, i) => {
        // A date column gets a native calendar picker instead of a free-text box.
        const isDate = isDateHeader(h);
        return (
          <td key={h} className={`px-3 py-2 align-middle ${cellClassName}`}>
            <input
              ref={i === 0 ? firstRef : undefined}
              type={isDate ? 'date' : 'text'}
              value={draft[h] ?? ''}
              onChange={e => setDraft(d => ({ ...d, [h]: e.target.value }))}
              onKeyDown={onKeyDown}
              // Native date inputs ignore placeholder and show their own format
              // hint, so only the text inputs carry the column-name placeholder.
              placeholder={isDate ? undefined : h}
              aria-label={h}
              className="w-full min-w-[8rem] px-2 py-1 rounded border border-emerald-200 focus:border-emerald-500 text-sm bg-white"
            />
          </td>
        );
      })}
      {Array.from({ length: trailingCols }, (_, i) => (
        <td key={`pad-${i}`} className={`px-3 py-2 ${cellClassName}`} />
      ))}
      <td className={`px-3 py-2 align-middle whitespace-nowrap text-right sticky right-0 bg-emerald-50 ${cellClassName}`}>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-emerald-700 hover:text-emerald-800 text-xs font-semibold mr-3 disabled:opacity-50"
        >{busy ? 'Saving…' : 'Save'}</button>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-500 hover:text-slate-700 text-xs font-medium"
        >Cancel</button>
      </td>
    </tr>
  );
}
