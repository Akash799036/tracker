'use client';

import type { CustomField } from '@/lib/useCustomFields';
import { ReorderableHeader } from './ReorderableHeader';

// Shared UI for the database-backed custom fields, so every table that renders
// extra columns gets the same toolbar control, header chip and cell editor.

/** Header cell for one custom field: draggable, with inline move and delete. */
export function CustomFieldHeader({
  field,
  index,
  count,
  onMove,
  onDelete,
  className = '',
}: {
  field: CustomField;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onDelete: (field: CustomField) => void;
  className?: string;
}) {
  return (
    <ReorderableHeader
      index={index}
      count={count}
      // Custom fields reorder among themselves, never into the synced columns:
      // they are a separate list with its own persisted positions.
      group="custom-field"
      label={field.label}
      onMove={onMove}
      className={`bg-indigo-50/40 ${className}`}
    >
      {field.label}
      <button
        type="button"
        onClick={() => onDelete(field)}
        aria-label={`Delete field ${field.label}`}
        title="Delete this field"
        className="text-slate-500 hover:text-rose-600"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </ReorderableHeader>
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
