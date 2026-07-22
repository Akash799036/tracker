'use client';

import { useState, useRef, useEffect } from 'react';
import { DEVELOPER_OPTIONS } from '@/lib/types';

export function DeveloperMultiSelect({
  value,
  onChange,
  placeholder = 'Select Developer(s)…',
  className = '',
  autoOpen = false,
  onBlur,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  autoOpen?: boolean;
  onBlur?: () => void;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [customList, setCustomList] = useState<string[]>([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [newDevName, setNewDevName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse comma-separated value into array of trimmed strings
  const selectedList = value
    ? value.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const allDeveloperOptions = Array.from(new Set([...DEVELOPER_OPTIONS, ...customList]));

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    const timer = setTimeout(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      cleanup = () => document.removeEventListener('mousedown', handleClickOutside);
    }, 150);

    return () => {
      clearTimeout(timer);
      if (cleanup) cleanup();
    };
  }, []);

  const toggleOption = (opt: string) => {
    let next: string[];
    if (selectedList.includes(opt)) {
      next = selectedList.filter(s => s !== opt);
    } else {
      next = [...selectedList, opt];
    }
    onChange(next.join(', '));
  };

  const handleAddCustomDev = () => {
    const trimmed = newDevName.trim();
    if (trimmed) {
      if (!allDeveloperOptions.includes(trimmed)) {
        setCustomList(prev => [...prev, trimmed]);
      }
      if (!selectedList.includes(trimmed)) {
        toggleOption(trimmed);
      }
      setNewDevName('');
      setAddingCustom(false);
    }
  };

  const displayLabel = selectedList.length > 0 ? selectedList.join(', ') : placeholder;

  return (
    <div ref={containerRef} className="relative inline-block w-full text-left">
      <button
        type="button"
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(prev => !prev);
        }}
        className={`w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded border border-slate-300 bg-white text-sm text-black hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${className}`}
      >
        <span className="truncate flex-1 font-normal text-black">
          {displayLabel}
        </span>
        <svg
          className="w-4 h-4 ml-1 shrink-0 text-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full min-w-[14rem] rounded-md bg-white shadow-lg border border-slate-200 py-1.5 max-h-60 overflow-auto"
          onClick={e => e.stopPropagation()}
        >
          {allDeveloperOptions.map(opt => {
            const isChecked = selectedList.includes(opt);
            return (
              <label
                key={opt}
                className="flex items-center px-3 py-1.5 text-xs text-black hover:bg-indigo-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOption(opt)}
                  className="mr-2 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{opt}</span>
              </label>
            );
          })}
          {/* Custom values present in value that aren't in allDeveloperOptions */}
          {selectedList.map(opt => {
            if (allDeveloperOptions.includes(opt)) return null;
            return (
              <label
                key={opt}
                className="flex items-center px-3 py-1.5 text-xs text-black hover:bg-indigo-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => toggleOption(opt)}
                  className="mr-2 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{opt}</span>
              </label>
            );
          })}

          {addingCustom ? (
            <div className="p-2 border-t border-slate-100 flex items-center gap-1">
              <input
                type="text"
                autoFocus
                value={newDevName}
                onChange={e => setNewDevName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomDev();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setAddingCustom(false);
                  }
                }}
                placeholder="Developer Name…"
                className="w-full px-2 py-1 rounded border border-indigo-400 text-xs bg-white text-black focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustomDev}
                className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-semibold shrink-0 hover:bg-indigo-700"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCustom(true)}
              className="w-full text-left px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border-t border-slate-100 flex items-center gap-1"
            >
              <span>+ Add New Developer…</span>
            </button>
          )}

          <div className="border-t border-slate-100 mt-1 pt-1.5 px-2 flex justify-end">
            <button
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                if (onBlur) onBlur();
              }}
              className="px-2.5 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
