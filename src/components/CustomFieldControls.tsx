'use client';

import { useState } from 'react';
import type { CustomField } from '@/lib/useCustomFields';

// Shared UI for the database-backed custom fields, so every table that renders
// extra columns gets the same toolbar control, header chip and cell editor.

/** Toolbar button that expands into a "name your field" inline form. */
export function AddFieldButton({
  onAdd,
  busy,
  disabled,
}: {
  onAdd: (label: string) => Promise<boolean> | boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');

  const close = () => { setAdding(false); setLabel(''); };
  const submit = async () => {
    const ok = await onAdd(label);
    if (ok) close();
  };

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        disabled={disabled}
        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-dashed border-indigo-300 text-xs font-semibold text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 disabled:opacity-50"
        title="Add a new field (column) to this sheet"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Field
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <input
        autoFocus
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') close();
        }}
        placeholder="Field name…"
        className="h-8 w-40 px-2 rounded-lg border border-slate-300 text-xs"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || !label.trim()}
        className="h-8 px-2.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
      >{busy ? 'Adding…' : 'Add'}</button>
      <button
        type="button"
        onClick={close}
        className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >Cancel</button>
    </div>
  );
}

/** Header cell for one custom field, with an inline delete control. */
export function CustomFieldHeader({
  field,
  onDelete,
  className = '',
}: {
  field: CustomField;
  onDelete: (field: CustomField) => void;
  className?: string;
}) {
  return (
    <th className={`text-left font-semibold px-3 py-2 whitespace-nowrap border-b border-slate-200 bg-indigo-50/40 ${className}`}>
      <span className="inline-flex items-center gap-1.5">
        {field.label}
        <button
          type="button"
          onClick={() => onDelete(field)}
          aria-label={`Delete field ${field.label}`}
          title="Delete this field"
          className="text-slate-400 hover:text-rose-600"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </span>
    </th>
  );
}

/** Editable cell for one custom field value. Saves on blur or Enter. */
export function CustomFieldCell({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => void;
}) {
  return (
    <td className="px-3 py-2 align-middle border-b border-slate-100 bg-indigo-50/20">
      <input
        // Uncontrolled so typing never round-trips through the network; the key
        // forces a remount when the persisted value changes underneath us.
        defaultValue={value}
        key={value}
        onBlur={e => {
          const next = e.target.value;
          if (next !== value) onSave(next);
        }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="—"
        className="w-full min-w-[8rem] px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-indigo-400 focus:bg-white text-sm bg-transparent"
      />
    </td>
  );
}
