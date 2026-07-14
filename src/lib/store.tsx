'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { FIELDS, CSV_HEADERS, type Project } from './types';
import { seedProjects } from './seed';

const STORAGE_KEY = 'project-tracker.v1';
const SEED_FLAG = 'project-tracker.seeded';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadAll(): Project[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

type Stats = { total: number; progress: number; live: number; hold: number; review: number; design: number };

type StoreCtx = {
  projects: Project[];
  ready: boolean;
  get: (id: string) => Project | null;
  upsert: (p: Project) => Project;
  remove: (id: string) => void;
  clear: () => void;
  stats: () => Stats;
  storageSize: () => number;
  exportJSON: () => string;
  exportCSV: () => string;
  importJSON: (text: string) => number;
};

const Ctx = createContext<StoreCtx | null>(null);

function csvEscape(v: unknown) {
  let s: string;
  if (typeof v === 'boolean') s = v ? 'Yes' : 'No';
  else s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let list = loadAll();
    if (!list.length && !localStorage.getItem(SEED_FLAG)) {
      list = seedProjects();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        localStorage.setItem(SEED_FLAG, '1');
      } catch {}
    }
    setProjects(list);
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setProjects(loadAll());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback((next: Project[]) => {
    setProjects(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const get = useCallback((id: string) => projects.find(p => p.id === id) || null, [projects]);

  const upsert = useCallback((p: Project) => {
    const now = Date.now();
    const list = projects.slice();
    if (p.id) {
      const i = list.findIndex(x => x.id === p.id);
      if (i > -1) { p.createdAt = list[i].createdAt || now; p.updatedAt = now; list[i] = p; }
      else { p.createdAt = p.createdAt || now; p.updatedAt = now; list.unshift(p); }
    } else {
      p.id = uid(); p.createdAt = now; p.updatedAt = now; list.unshift(p);
    }
    persist(list);
    return p;
  }, [projects, persist]);

  const remove = useCallback((id: string) => {
    persist(projects.filter(p => p.id !== id));
  }, [projects, persist]);

  const clear = useCallback(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith('project-tracker.') ||
        k.startsWith('sheet-sync.') ||
        k === 'all-projects.v1'
      ) {
        localStorage.removeItem(k);
      }
    }
    persist([]);
  }, [persist]);

  const stats = useCallback((): Stats => {
    const lc = (s?: string) => (s || '').toLowerCase();
    return {
      total: projects.length,
      progress: projects.filter(p => lc(p.status).includes('progress') || lc(p.status).includes('development')).length,
      live: projects.filter(p => lc(p.status) === 'live').length,
      hold: projects.filter(p => lc(p.status).includes('hold')).length,
      review: projects.filter(p => lc(p.status).includes('review')).length,
      design: projects.filter(p => lc(p.status).includes('design')).length,
    };
  }, [projects]);

  const storageSize = useCallback(() => new Blob([JSON.stringify(projects)]).size, [projects]);
  const exportJSON = useCallback(() => JSON.stringify(projects, null, 2), [projects]);
  const exportCSV = useCallback(() => {
    const rows = [CSV_HEADERS.map(csvEscape).join(',')];
    projects.forEach(p => rows.push(FIELDS.map(f => csvEscape((p as any)[f])).join(',')));
    return rows.join('\n');
  }, [projects]);

  const importJSON = useCallback((text: string) => {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
    const byId = new Map(projects.map(p => [p.id, p]));
    let added = 0;
    parsed.forEach((p: Project) => {
      if (!p.id) p.id = uid();
      byId.set(p.id, p);
      added++;
    });
    persist([...byId.values()]);
    return added;
  }, [projects, persist]);

  const value = useMemo<StoreCtx>(() => ({
    projects, ready, get, upsert, remove, clear, stats, storageSize, exportJSON, exportCSV, importJSON,
  }), [projects, ready, get, upsert, remove, clear, stats, storageSize, exportJSON, exportCSV, importJSON]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
