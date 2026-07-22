'use client';

import { getCleanFileName, getFileUrl } from './ui';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Modal from '@/components/Modal';
import type { SheetRowRecord } from './allProjectsTypes';
import { isDateHeader, toDateInputValue } from './dateField';
import { useAuth } from './useAuth';

function ProjectCredentialsModal({
  row,
  headers,
  pageKey,
  onClose,
  onSave,
}: {
  row: SheetRowRecord;
  headers: string[];
  pageKey?: string;
  onClose: () => void;
  onSave?: () => void | Promise<void>;
}) {
  const { canEdit } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getHeaderInfo = (possibleHeaders: string[], fallbackName: string) => {
    for (const h of headers) {
      if (possibleHeaders.includes(h.toLowerCase())) {
        return { header: h, value: String(row.cells[h] ?? '') };
      }
    }
    return { header: fallbackName, value: '' };
  };

  const website = getHeaderInfo(['website link', 'website', 'domain name', 'domain', 'url'], 'Website Link');
  const loginUrl = getHeaderInfo(['login url', 'login'], 'Login URL');
  const username = getHeaderInfo(['username', 'username/id', 'user id', 'username / id'], 'Username / ID');
  const password = getHeaderInfo(['password', 'pass'], 'Password');
  const projectNameInfo = getHeaderInfo(['project name', 'project', 'title'], 'Project Name');

  const projectName = projectNameInfo.value ? projectNameInfo.value : 'Project';

  useEffect(() => {
    setDraft({
      [website.header]: String(row.cells[website.header] ?? ''),
      [loginUrl.header]: String(row.cells[loginUrl.header] ?? ''),
      [username.header]: String(row.cells[username.header] ?? ''),
      [password.header]: String(row.cells[password.header] ?? ''),
    });
  }, [row, website.header, loginUrl.header, username.header, password.header]);

  const renderUrlField = (val: string) => {
    if (!val || val === '—') return <span className="text-slate-400">—</span>;
    const href = getFileUrl(val);
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1 font-medium break-all"
      >
        <span>{getCleanFileName(val)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-70"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    );
  };

  const handleSave = async () => {
    const credHeaders = [website.header, loginUrl.header, username.header, password.header];
    const diff: Record<string, string> = {};
    for (const h of credHeaders) {
      const next = draft[h] ?? '';
      const original = String(row.cells[h] ?? '');
      if (next !== original) diff[h] = next;
    }

    if (Object.keys(diff).length === 0) {
      setEditing(false);
      return;
    }

    if (!pageKey) {
      for (const [k, v] of Object.entries(diff)) {
        row.cells[k] = v;
      }
      setEditing(false);
      if (onSave) await onSave();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheet-rows/${pageKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowUid: row.uid, cells: diff }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'Could not save credentials');
      }
      for (const [k, v] of Object.entries(diff)) {
        row.cells[k] = v;
      }
      setEditing(false);
      if (onSave) await onSave();
    } catch (e: any) {
      setError(e?.message || 'Could not save credentials');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft({
      [website.header]: String(row.cells[website.header] ?? ''),
      [loginUrl.header]: String(row.cells[loginUrl.header] ?? ''),
      [username.header]: String(row.cells[username.header] ?? ''),
      [password.header]: String(row.cells[password.header] ?? ''),
    });
    setEditing(false);
    setError(null);
  };

  return (
    <Modal
      title={editing ? `Edit Credentials (${projectName})` : `Credentials for ${projectName}`}
      subtitle={editing ? 'Update website, login URL, username, and password below' : 'Click Edit Credentials to update project login details'}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <div className="p-5 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {error}
          </div>
        )}

        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="lbl">{website.header}</label>
                <input
                  type="text"
                  value={draft[website.header] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [website.header]: e.target.value }))}
                  placeholder="https://example.com"
                  className="fld text-black"
                />
              </div>
              <div>
                <label className="lbl">{loginUrl.header}</label>
                <input
                  type="text"
                  value={draft[loginUrl.header] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [loginUrl.header]: e.target.value }))}
                  placeholder="https://example.com/login"
                  className="fld text-black"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="lbl">{username.header}</label>
                <input
                  type="text"
                  value={draft[username.header] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [username.header]: e.target.value }))}
                  placeholder="Username or Email"
                  className="fld text-black"
                />
              </div>
              <div>
                <label className="lbl">{password.header}</label>
                <input
                  type="text"
                  value={draft[password.header] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [password.header]: e.target.value }))}
                  placeholder="Password"
                  className="fld text-black font-mono"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{website.header}</div>
                <div className="text-sm text-black bg-slate-50 p-2.5 rounded-lg border border-slate-200 break-all select-all">
                  {renderUrlField(String(row.cells[website.header] ?? ''))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{loginUrl.header}</div>
                <div className="text-sm text-black bg-slate-50 p-2.5 rounded-lg border border-slate-200 break-all select-all">
                  {renderUrlField(String(row.cells[loginUrl.header] ?? ''))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{username.header}</div>
                <div className="text-sm font-medium text-black bg-slate-50 p-2.5 rounded-lg border border-slate-200 break-all select-all">
                  {String(row.cells[username.header] ?? '') || '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{password.header}</div>
                <div className="text-sm font-mono font-semibold text-black bg-slate-50 p-2.5 rounded-lg border border-slate-200 break-all select-all">
                  {String(row.cells[password.header] ?? '') || '—'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 px-5 py-3 bg-slate-50 flex items-center justify-between gap-3">
        {editing ? (
          <>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              {saving ? 'Saving…' : 'Save Credentials'}
            </button>
          </>
        ) : (
          <>
            {/* Editing credentials requires a login; signed-out users can view
                but not change them. */}
            {canEdit ? (
              <button
                onClick={() => setEditing(true)}
                className="px-3.5 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 text-xs font-semibold hover:bg-brand-100 flex items-center gap-1.5 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Edit Credentials
              </button>
            ) : <span />}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
            >
              Close
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

export function useProjectCredentials(
  headers: string[],
  pageKey?: string,
  onSave?: () => void | Promise<void>
) {
  const [activeRow, setActiveRow] = useState<SheetRowRecord | null>(null);

  const renderProjectNameCell = useCallback(
    (row: SheetRowRecord, header: string, value: unknown, fallback: ReactNode): ReactNode => {
      if (header.toLowerCase() !== 'project name' && header.toLowerCase() !== 'project') {
        return fallback;
      }
      return (
        <span className="relative group inline-block max-w-full">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setActiveRow(row); }}
            title="Click Me"
            className="font-semibold text-black underline decoration-slate-400 decoration-dotted underline-offset-2 transition-colors hover:text-slate-700 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded text-left truncate"
          >
            {String(value)}
          </button>
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow-md whitespace-nowrap z-30">
            Click Me
          </span>
        </span>
      );
    },
    []
  );

  const credModal = activeRow ? (
    <ProjectCredentialsModal
      row={activeRow}
      headers={headers}
      pageKey={pageKey}
      onClose={() => setActiveRow(null)}
      onSave={onSave}
    />
  ) : null;

  return { renderProjectNameCell, credModal };
}
