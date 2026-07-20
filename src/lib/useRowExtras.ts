'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// Client state for per-row ad-hoc fields, scoped to one (pageKey, sheetName).
//
// Distinct from useCustomFields: a custom field is a column added to the whole
// sheet, so every row gets a cell. A row extra belongs to a single row, so
// different rows can carry entirely different sets of fields.

export type RowExtra = {
  id: number;
  rowUid: string;
  label: string;
  value: string;
  position: number;
};

export function useRowExtras(pageKey: string, sheetName: string) {
  const [extras, setExtras] = useState<RowExtra[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (name: string) => {
    if (!name) { setExtras([]); return; }
    try {
      const res = await fetch(
        `/api/row-extras/${pageKey}?sheet=${encodeURIComponent(name)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed to load fields');
      setExtras((json.extras || []) as RowExtra[]);
    } catch {
      setExtras([]);
    }
  }, [pageKey]);

  useEffect(() => { reload(sheetName); }, [sheetName, reload]);

  /** Extras grouped by row, so a row can render its own set in one lookup. */
  const byRow = useMemo(() => {
    const map = new Map<string, RowExtra[]>();
    for (const e of extras) {
      const list = map.get(e.rowUid);
      if (list) list.push(e);
      else map.set(e.rowUid, [e]);
    }
    return map;
  }, [extras]);

  /** Every distinct label in this sheet, for the export's trailing columns. */
  const allLabels = useMemo(() => {
    const seen = new Set<string>();
    for (const e of extras) seen.add(e.label);
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [extras]);

  const addExtra = useCallback(async (rowUid: string, label: string, value: string) => {
    const trimmed = label.trim();
    if (!trimmed) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/row-extras/${pageKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowUid, label: trimmed, value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed to add field');
      setExtras(prev => [...prev, json.extra as RowExtra]);
      return true;
    } catch (e: any) {
      setError(e?.message || 'failed to add field');
      return false;
    } finally {
      setBusy(false);
    }
  }, [pageKey]);

  /** Update a value, showing it immediately and reverting if the save fails. */
  const setExtraValue = useCallback(async (rowUid: string, label: string, value: string) => {
    let previous: string | undefined;
    setExtras(prev => prev.map(e => {
      if (e.rowUid !== rowUid || e.label !== label) return e;
      previous = e.value;
      return { ...e, value };
    }));
    try {
      const res = await fetch(`/api/row-extras/${pageKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowUid, label, value }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      if (previous !== undefined) {
        setExtras(prev => prev.map(e =>
          e.rowUid === rowUid && e.label === label ? { ...e, value: previous as string } : e
        ));
      }
      setError('could not save that value');
    }
  }, [pageKey]);

  const renameExtra = useCallback(async (rowUid: string, oldLabel: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === oldLabel) return false;
    setError(null);
    try {
      const res = await fetch(`/api/row-extras/${pageKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowUid, oldLabel, newLabel: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed to rename field');
      setExtras(prev => prev.map(e =>
        e.rowUid === rowUid && e.label === oldLabel ? { ...e, label: trimmed } : e
      ));
      return true;
    } catch (e: any) {
      setError(e?.message || 'failed to rename field');
      return false;
    }
  }, [pageKey]);

  const deleteExtra = useCallback(async (rowUid: string, label: string) => {
    setError(null);
    const snapshot = extras;
    setExtras(prev => prev.filter(e => !(e.rowUid === rowUid && e.label === label)));
    try {
      const res = await fetch(
        `/api/row-extras/${pageKey}?rowUid=${encodeURIComponent(rowUid)}&label=${encodeURIComponent(label)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('delete failed');
    } catch {
      setExtras(snapshot);
      setError('could not remove that field');
    }
  }, [pageKey, extras]);

  /** Drop a row's extras from local state after the row itself is deleted. */
  const forgetRow = useCallback((rowUid: string) => {
    setExtras(prev => prev.filter(e => e.rowUid !== rowUid));
  }, []);

  return {
    extras, byRow, allLabels, busy, error,
    addExtra, setExtraValue, renameExtra, deleteExtra, forgetRow, reload,
  };
}
