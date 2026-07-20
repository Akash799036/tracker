'use client';

import { useCallback, useEffect, useState } from 'react';
import { moveItem, sameOrder } from './reorder';

/**
 * Client-side ordering for a sheet's built-in (synced) columns.
 *
 * The server already returns headers in the user's stored order, so this hook
 * holds no order of its own at rest — it mirrors the server array and only
 * diverges while a local move is in flight. That keeps a re-sync or a sheet
 * switch authoritative without extra reconciliation here.
 *
 * `serverHeaders` is the array from /api/sheet-sync for the active sheet.
 */
export function useHeaderOrder(pageKey: string, sheetName: string, serverHeaders: string[]) {
  const [headers, setHeaders] = useState<string[]>(serverHeaders);
  const [error, setError] = useState<string | null>(null);

  // Re-mirror whenever the server's array changes (sheet switch, re-sync, or a
  // reorder we just persisted coming back around). Compared by value: the
  // parent rebuilds this array on every render, so an identity check would
  // clobber an in-flight local move on unrelated re-renders.
  useEffect(() => {
    setHeaders(prev => (sameOrder(prev, serverHeaders) ? prev : serverHeaders));
  }, [serverHeaders]);

  const reorderHeaders = useCallback(async (from: number, to: number) => {
    if (!sheetName) return;
    let prevOrder: string[] = [];
    let nextOrder: string[] = [];
    setHeaders(prev => {
      prevOrder = prev;
      nextOrder = moveItem(prev, from, to);
      return nextOrder;
    });
    if (sameOrder(prevOrder, nextOrder)) return;

    try {
      const res = await fetch(`/api/header-order/${pageKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName, order: nextOrder }),
      });
      if (!res.ok) throw new Error('failed to reorder');
      setError(null);
    } catch {
      setHeaders(prevOrder);
      setError('Could not save the new column order.');
    }
  }, [pageKey, sheetName]);

  return { headers, reorderHeaders, orderError: error };
}
