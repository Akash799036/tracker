'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  /** True while the first pull from the live database is still in flight. */
  syncing: boolean;
  /**
   * Pull the projects sheet from the live database. Called on demand by the
   * pages that actually show project rows (Ongoing / Live Projects), so the
   * projects API is not hit on app load or on pages that don't need it. Safe to
   * call repeatedly — it only performs the network pull once per session.
   */
  ensureSynced: () => void;
  get: (id: string) => Project | null;
  upsert: (p: Project) => Project | Promise<Project>;
  remove: (id: string) => void | Promise<void>;
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

function projectToCells(p: Project): Record<string, string> {
  return {
    'Project name': p.projectName || '',
    'Start Date': p.startDate || '',
    'Platform': p.platform || '',
    'Figma Approval Date': p.figmaApproval || '',
    'Html Approval Date': p.htmlApproval || '',
    'Cms Approval Date': p.cmsApproval || '',
    'Project Live Date': p.liveDate || '',
    'Project Manager': p.projectManager || '',
    'Project Scope': p.projectScope || '',
    'Google Drive link (All Available Scope)': p.driveLink || '',
    'Developer': p.developer || '',
    'Status': p.status || '',
    'Last Working day': p.lastWorkingDay || '',
    'Current Update': p.currentUpdate || '',
    'Domain Name': p.domainName || '',
    'Hosting': p.hosting || '',
    'Hosting Detail': p.hostingDetail || '',
    'Domain': p.domain || '',
    'SSL Status': p.sslStatus || '',
    'Admin Access': p.adminAccess || '',
    'Editor Access': p.editorAccess || '',
    'Client Email': p.clientEmail || '',
    'Client Phone': p.clientPhone || '',
    'Start Date of Maintenance': p.maintenanceStart || '',
    'End Date of Maintenance': p.maintenanceEnd || '',
    'Maintenance Duration': p.maintenanceDuration || '',
    'Project Category': p.projectCategory || '',
    'Website Link': p.websiteLink || '',
    'Login URL': p.loginUrl || '',
    'Username/ID': p.username || '',
    'Password': p.password || '',
  };
}

function cellsToProject(rowUid: string, cells: Record<string, string>): Project {
  return {
    id: rowUid,
    projectName: cells['Project name'] || cells['Project Name'] || cells['project'] || '',
    startDate: cells['Start Date'] || '',
    platform: cells['Platform'] || '',
    figmaApproval: cells['Figma Approval Date'] || cells['Figma Approval'] || '',
    htmlApproval: cells['Html Approval Date'] || cells['HTML Approval'] || '',
    cmsApproval: cells['Cms Approval Date'] || cells['CMS Approval'] || '',
    liveDate: cells['Project Live Date'] || cells['Live Date'] || '',
    projectManager: cells['Project Manager'] || '',
    projectScope: cells['Project Scope'] || '',
    driveLink: cells['Google Drive link (All Available Scope)'] || cells['Drive Link'] || cells['Google Drive link'] || '',
    developer: cells['Developer'] || '',
    status: cells['Status'] || '',
    lastWorkingDay: cells['Last Working day'] || '',
    currentUpdate: cells['Current Update'] || '',
    domainName: cells['Domain Name'] || '',
    hosting: cells['Hosting'] || '',
    hostingDetail: cells['Hosting Detail'] || '',
    domain: cells['Domain'] || '',
    sslStatus: cells['SSL Status'] || '',
    adminAccess: cells['Admin Access'] || '',
    editorAccess: cells['Editor Access'] || '',
    clientEmail: cells['Client Email'] || cells['Email id Provided by client'] || '',
    clientPhone: cells['Client Phone'] || cells['Phone Numbers Client provided'] || '',
    maintenanceStart: cells['Start Date of Maintenance'] || cells['Maintenance Start'] || '',
    maintenanceEnd: cells['End Date of Maintenance'] || cells['Maintenance End'] || '',
    maintenanceDuration: cells['Maintenance Duration'] || '',
    projectCategory: cells['Project Category'] || '',
    websiteLink: cells['Website Link'] || '',
    loginUrl: cells['Login URL'] || '',
    username: cells['Username/ID'] || cells['Username'] || '',
    password: cells['Password'] || '',
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  // Distinct from `ready`: `ready` flips as soon as the local cache is read so
  // the app can render, while `syncing` stays true until the authoritative
  // database pull finishes. Pages use it to keep the loader up until real data
  // is on screen rather than only until localStorage was read.
  const [syncing, setSyncing] = useState(true);
  // Guards the on-demand database pull so it runs at most once per session even
  // if several pages call ensureSynced().
  const syncStarted = useRef(false);

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

  // Pull the projects sheet from the live database — only when a page that needs
  // it asks, not on app load. Runs once per session; later calls are no-ops.
  const ensureSynced = useCallback(() => {
    if (syncStarted.current) return;
    syncStarted.current = true;
    (async () => {
      try {
        const res = await fetch('/api/sheet-sync/projects');
        if (!res.ok) return;
        const data = await res.json();
        const dbProjects: Project[] = [];
        for (const sheet of data.sheets || []) {
          for (const row of sheet.rows || []) {
            dbProjects.push(cellsToProject(row.uid, row.cells));
          }
        }
        if (dbProjects.length > 0) {
          setProjects(dbProjects);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(dbProjects)); } catch {}
        }
      } catch {}
      finally { setSyncing(false); }
    })();
  }, []);

  const persist = useCallback((next: Project[]) => {
    setProjects(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const get = useCallback((id: string) => projects.find(p => p.id === id) || null, [projects]);

  const upsert = useCallback(async (p: Project) => {
    const now = Date.now();
    const list = projects.slice();
    let targetId = p.id;
    if (!targetId) {
      targetId = uid();
      p.id = targetId;
    }

    const i = list.findIndex(x => x.id === targetId);
    if (i > -1) {
      p.createdAt = list[i].createdAt || now;
      p.updatedAt = now;
      list[i] = p;
    } else {
      p.createdAt = p.createdAt || now;
      p.updatedAt = now;
      list.unshift(p);
    }

    persist(list);

    // Sync with live database
    try {
      const cells = projectToCells(p);
      if (p.id && i > -1) {
        await fetch('/api/sheet-rows/projects', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowUid: p.id, cells }),
        });
      } else {
        const res = await fetch('/api/sheet-rows/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheetName: 'Projects', cells }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.row?.uid) {
            p.id = json.row.uid;
            const updatedList = list.map(item => item.id === targetId ? { ...item, id: json.row.uid } : item);
            persist(updatedList);
          }
        }
      }
    } catch {}

    return p;
  }, [projects, persist]);

  const remove = useCallback(async (id: string) => {
    persist(projects.filter(p => p.id !== id));
    try {
      await fetch(`/api/sheet-rows/projects?uid=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {}
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
    projects, ready, syncing, ensureSynced, get, upsert, remove, clear, stats, storageSize, exportJSON, exportCSV, importJSON,
  }), [projects, ready, syncing, ensureSynced, get, upsert, remove, clear, stats, storageSize, exportJSON, exportCSV, importJSON]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
