'use client';

import { useEffect, useRef, useState } from 'react';
import type { CustomField } from '@/lib/useCustomFields';
import { ReorderableHeader } from './ReorderableHeader';

// Shared UI for the database-backed custom fields, so every table that renders
// extra columns gets the same toolbar control, header chip and cell editor.

/**
 * Toolbar control for adding a new column (custom field). Mirrors AddRowButton,
 * but in the indigo custom-field palette. Clicking reveals an inline name input
 * that commits on Enter and cancels on Escape or blur, so a new column can be
 * created without leaving the toolbar or using a browser prompt.
 */
export function AddColumnButton({
  onAdd,
  disabled,
  label = 'Add Column',
}: {
  onAdd: (label: string) => Promise<boolean> | boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const close = () => { setOpen(false); setName(''); };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const ok = await onAdd(trimmed);
    setBusy(false);
    if (ok) close();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-dashed border-indigo-300 text-xs font-semibold text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 disabled:opacity-50"
        title="Add a new column to this sheet"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        {label}
      </button>
    );
  }

  return (
    <div className="h-8 inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white pl-2 pr-1">
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.preventDefault(); close(); }
        }}
        placeholder="Column name"
        aria-label="New column name"
        className="w-28 text-xs bg-transparent outline-none placeholder:text-slate-400"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || !name.trim()}
        className="h-6 px-2 inline-flex items-center rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
      >{busy ? '…' : 'Add'}</button>
      <button
        type="button"
        onClick={close}
        aria-label="Cancel adding column"
        className="h-6 w-6 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-700"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

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

/**
 * Editable cell for one custom field value.
 *
 * A single click does nothing; a double click reveals the input, matching
 * SheetCell so every column edits the same way and a stray click never
 * overwrites a value. Saves on blur or Enter, discards on Escape.
 */
export function CustomFieldCell({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <td className="px-3 py-2 align-middle border-b border-slate-100 bg-indigo-50/20">
        <input
          ref={inputRef}
          // Uncontrolled so typing never round-trips through the network; the key
          // forces a remount when the persisted value changes underneath us.
          defaultValue={value}
          key={value}
          onBlur={e => {
            const next = e.target.value;
            if (next !== value) onSave(next);
            setEditing(false);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
          placeholder="—"
          className="w-full min-w-[8rem] px-2 py-1 rounded border border-indigo-400 focus:outline-none text-sm bg-white"
        />
      </td>
    );
  }

  return (
    <td
      // A single click does nothing; only a double click opens the editor.
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
      className="px-3 py-2 align-middle border-b border-slate-100 bg-indigo-50/20 cursor-default"
    >
      <span className="block min-w-[8rem] px-2 py-1 text-sm truncate">
        {value === '' ? <span className="text-slate-300">—</span> : value}
      </span>
    </td>
  );
}
