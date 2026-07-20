'use client';

import { useCallback, useEffect, useState } from 'react';

// Client-side state for the database-backed custom fields (extra columns) that
// any sheet table can render. Scoped to (pageKey, sheetName) to match the API.

export type CustomField = {
  id: number;
  pageKey: string;
  sheetName: string;
  label: string;
  position: number;
};

export type CustomFieldValue = {
  fieldId: number;
  rowKey: number;
  value: string;
};

/** Value lookup keyed as `${fieldId}:${rowKey}`. */
export type ValueMap = Record<string, string>;

export const vkey = (fieldId: number, rowKey: number) => `${fieldId}:${rowKey}`;

export function useCustomFields(pageKey: string, sheetName: string) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<ValueMap>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload fields + values whenever the active sheet changes.
  const reload = useCallback(async (name: string) => {
    if (!name) { setFields([]); setValues({}); return; }
    try {
      const res = await fetch(
        `/api/custom-fields/${pageKey}?sheet=${encodeURIComponent(name)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed to load fields');
      const map: ValueMap = {};
      for (const v of (json.values || []) as CustomFieldValue[]) {
        map[vkey(v.fieldId, v.rowKey)] = v.value;
      }
      setFields((json.fields || []) as CustomField[]);
      setValues(map);
    } catch {
      setFields([]);
      setValues({});
    }
  }, [pageKey]);

  useEffect(() => { reload(sheetName); }, [sheetName, reload]);

  const addField = useCallback(async (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || !sheetName) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/custom-fields/${pageKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName, label: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed to add field');
      setFields(prev => [...prev, json.field as CustomField]);
      return true;
    } catch (e: any) {
      setError(e?.message || 'failed to add field');
      return false;
    } finally {
      setBusy(false);
    }
  }, [pageKey, sheetName]);

  const deleteField = useCallback(async (field: CustomField) => {
    if (!confirm(`Delete the "${field.label}" field and all its values?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/custom-fields/${pageKey}?id=${field.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'failed to delete field');
      }
      setFields(prev => prev.filter(f => f.id !== field.id));
      setValues(prev => {
        const next = { ...prev };
        for (const k of Object.keys(next)) if (k.startsWith(`${field.id}:`)) delete next[k];
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'failed to delete field');
    }
  }, [pageKey]);

  /** Persist a single cell value, optimistically updating local state first. */
  const setValue = useCallback(async (fieldId: number, rowKey: number, value: string) => {
    setValues(prev => ({ ...prev, [vkey(fieldId, rowKey)]: value }));
    try {
      await fetch(`/api/custom-fields/${pageKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldId, rowKey, value }),
      });
    } catch { /* value stays in local state; will re-sync on next load */ }
  }, [pageKey]);

  return { fields, values, busy, error, addField, deleteField, setValue };
}
