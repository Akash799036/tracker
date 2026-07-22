'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isDateHeader, toDateInputValue } from '@/lib/dateField';
import { PLATFORM_OPTIONS, PM_OPTIONS, STATUS_OPTIONS, SCOPE_OPTIONS, isPlatformHeader, isPMHeader, isDeveloperHeader, isStatusHeader, isDriveOrScopeHeader, isScopeHeader } from '@/lib/types';
import { FileUploadInput } from './FileUploadInput';
import { DeveloperMultiSelect } from './DeveloperMultiSelect';
import { SelectWithAddNew } from './SelectWithAddNew';

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
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const isDate = isDateHeader(header);
  const isPlatform = isPlatformHeader(header);
  const isPM = isPMHeader(header);
  const isDeveloper = isDeveloperHeader(header);
  const isStatus = isStatusHeader(header);
  const isScope = isScopeHeader(header);
  const isDriveOrScope = isDriveOrScopeHeader(header);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      if (inputRef.current && 'select' in inputRef.current) {
        (inputRef.current as HTMLInputElement).select?.();
      }
    }
  }, [editing]);

  const begin = () => {
    setDraft(isDate ? toDateInputValue(value) : value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const baseline = isDate ? toDateInputValue(value) : value;
    if (draft !== baseline) onSave(draft);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(isDate ? toDateInputValue(value) : value);
  };

  if (editing) {
    if (isDriveOrScope) {
      return (
        <td className={`px-3 py-2 align-middle ${className}`}>
          <div className="flex items-center gap-2">
            <FileUploadInput
              value={draft}
              onChange={val => { setDraft(val); }}
              className="w-full px-2 py-1 rounded border border-indigo-400 focus:outline-none text-sm bg-white text-black"
            />
            <button
              type="button"
              onClick={commit}
              className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-semibold shrink-0"
            >
              Done
            </button>
          </div>
        </td>
      );
    }

    if (isPlatform) {
      return (
        <td className={`px-3 py-2 align-middle ${className}`}>
          <SelectWithAddNew
            value={draft}
            onChange={val => setDraft(val)}
            options={PLATFORM_OPTIONS}
            placeholder="Select Platform…"
            className="w-full min-w-[8rem] px-2 py-1 rounded border border-indigo-400 focus:outline-none text-sm bg-white text-black"
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            selectRef={inputRef as any}
          />
        </td>
      );
    }

    if (isPM) {
      return (
        <td className={`px-3 py-2 align-middle ${className}`}>
          <SelectWithAddNew
            value={draft}
            onChange={val => setDraft(val)}
            options={PM_OPTIONS}
            placeholder="Select PM…"
            className="w-full min-w-[8rem] px-2 py-1 rounded border border-indigo-400 focus:outline-none text-sm bg-white text-black"
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            selectRef={inputRef as any}
          />
        </td>
      );
    }

    if (isDeveloper) {
      return (
        <td className={`px-3 py-2 align-middle ${className}`}>
          <div className="flex items-center gap-2">
            <DeveloperMultiSelect
              value={draft}
              onChange={val => setDraft(val)}
              onBlur={commit}
              autoOpen
              className="w-full min-w-[10rem]"
            />
            <button
              type="button"
              onClick={commit}
              className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-semibold shrink-0"
            >
              Done
            </button>
          </div>
        </td>
      );
    }

    if (isScope) {
      return (
        <td className={`px-3 py-2 align-middle ${className}`}>
          <select
            ref={inputRef as any}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            className="w-full min-w-[8rem] px-2 py-1 rounded border border-indigo-400 focus:outline-none text-sm bg-white text-black"
          >
            <option value="">Select…</option>
            {SCOPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
      );
    }

    if (isStatus) {
      return (
        <td className={`px-3 py-2 align-middle ${className}`}>
          <SelectWithAddNew
            value={draft}
            onChange={val => setDraft(val)}
            options={STATUS_OPTIONS}
            placeholder="Select Status…"
            className="w-full min-w-[8rem] px-2 py-1 rounded border border-indigo-400 focus:outline-none text-sm bg-white text-black"
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            selectRef={inputRef as any}
          />
        </td>
      );
    }

    return (
      <td className={`px-3 py-2 align-middle ${className}`}>
        <input
          ref={inputRef as any}
          type={isDate ? 'date' : 'text'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          className="w-full min-w-[8rem] px-2 py-1 rounded border border-indigo-400 focus:outline-none text-sm bg-white text-black"
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
      className={`px-3 py-2 align-middle whitespace-nowrap max-w-[28rem] truncate cursor-default text-black ${className}`}
    >
      {/* An empty value would collapse to an unclickable sliver, so show a faint
          dash as the hit target — same convention as CustomFieldCell. */}
      {value === '' ? <span className="text-slate-300">—</span> : children}
    </td>
  );
}
