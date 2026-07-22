'use client';

import { useRef, useState } from 'react';
import { getCleanFileName } from '@/lib/ui';

export function FileUploadInput({
  value,
  onChange,
  placeholder,
  multiline = false,
  className = '',
  projectName = '',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  projectName?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayValue = getCleanFileName(value);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (projectName) formData.append('projectName', projectName);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Upload failed');
      }

      onChange(json.url);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center gap-2 w-full">
        {multiline ? (
          <textarea
            value={displayValue}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`flex-1 ${className}`}
          />
        ) : (
          <input
            type="text"
            value={displayValue}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`flex-1 ${className}`}
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Upload CSV, XLSX, or PDF file"
          className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>{uploading ? 'Uploading…' : 'Upload File'}</span>
        </button>
      </div>

      {error && <div className="text-xs text-rose-600 font-medium">{error}</div>}
    </div>
  );
}
