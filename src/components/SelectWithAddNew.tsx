'use client';

import { useState } from 'react';

import { useGsap } from '@/lib/useGsap';

export function SelectWithAddNew({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = 'w-full min-w-[8rem] px-2 py-1 rounded border border-slate-300 text-sm bg-white text-black',
  addNewLabel = '+ Add New Option…',
  onBlur,
  onKeyDown,
  selectRef,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  addNewLabel?: string;
  onBlur?: (e: React.FocusEvent<HTMLSelectElement | HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLSelectElement | HTMLInputElement>) => void;
  selectRef?: any;
}) {
  const [addingCustom, setAddingCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customOptions, setCustomOptions] = useState<string[]>([]);

  const customRef = useGsap<HTMLDivElement>('fade');
  const allOptions = Array.from(new Set([...options, ...customOptions]));

  const handleSelectChange = (val: string) => {
    if (val === '__ADD_NEW__') {
      setAddingCustom(true);
      setCustomValue('');
    } else {
      onChange(val);
    }
  };

  const handleConfirmCustom = () => {
    const trimmed = customValue.trim();
    if (trimmed) {
      if (!allOptions.includes(trimmed)) {
        setCustomOptions(prev => [...prev, trimmed]);
      }
      onChange(trimmed);
    }
    setAddingCustom(false);
  };

  if (addingCustom) {
    return (
      <div ref={customRef} className="flex items-center gap-1 w-full min-w-[10rem]">
        <input
          type="text"
          autoFocus
          value={customValue}
          onChange={e => setCustomValue(e.target.value)}
          onBlur={e => {
            handleConfirmCustom();
            if (onBlur) onBlur(e as any);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleConfirmCustom();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setAddingCustom(false);
            }
            if (onKeyDown) onKeyDown(e as any);
          }}
          placeholder="Enter new option…"
          className="w-full px-2 py-1 rounded border border-indigo-500 text-sm bg-white text-black focus:outline-none shadow-sm"
        />
        <button
          type="button"
          onClick={handleConfirmCustom}
          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded shrink-0"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setAddingCustom(false)}
          className="px-1.5 py-1 text-slate-500 hover:text-slate-700 text-xs font-semibold shrink-0"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <select
      ref={selectRef}
      value={value}
      onChange={e => handleSelectChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={className}
    >
      <option value="">{placeholder}</option>
      {allOptions.map(opt => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
      {value && !allOptions.includes(value) && (
        <option value={value}>{value}</option>
      )}
      <option value="__ADD_NEW__" className="font-semibold text-indigo-600 bg-indigo-50">
        {addNewLabel}
      </option>
    </select>
  );
}
