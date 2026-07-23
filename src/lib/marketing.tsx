'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type MarketingTask = {
  id: string;
  taskType?: string;
  pm?: string;
  date?: string;
  dm?: string;
  link?: string;
  status?: string;
  completion?: string;
  workStatus?: string;
  createdAt?: number;
  updatedAt?: number;
};

const KEY = 'project-tracker.marketing.v1';
const SEED_FLAG = 'project-tracker.marketing.seeded.v1';

const SEED: Omit<MarketingTask, 'id'>[] = [
  { taskType: 'webart — Create 2 pages on new website', pm: 'Pritam', date: '2026-05-21', dm: 'Rohit', status: 'Pending' },
  { taskType: 'PMT — Web page content update', pm: 'Pritam', date: '2026-05-21', dm: 'Priyanka Paul', status: 'Pending', completion: 'Done', workStatus: 'Everything complete except room content' },
  { taskType: 'Infinite Collision — technical issue', pm: 'Pritam', date: '2026-06-02', dm: 'Rohit', status: 'Pending', workStatus: 'Backend only' },
  { taskType: 'gotomentors — Blog color scheme change', pm: 'Megha Dhara', date: '2026-06-11', dm: 'Ankur Bhattacharjee' },
  { taskType: 'Alice Scenic Studios — Website Issues', pm: 'Pritam Sen', date: '2026-06-15', dm: 'Suvajit Kar', status: 'Done', workStatus: 'Slider addition pending' },
  { taskType: 'all love of collection — fix layout', pm: 'Akash Nag', date: '2026-06-17', dm: 'Pratiti', status: 'Pending', completion: 'Done' },
  { taskType: 'doctorsmile — Fix page speed', pm: 'Sibam', date: '2026-06-26', dm: 'Pratiti', status: 'Done' },
  { taskType: 'Renovate Success — Blog structure fix', pm: 'Pritam', date: '2026-06-29', dm: 'Rohit', status: 'Pending' },
  { taskType: 'vibe wear fashion — content upload', pm: 'Megha Dhara', date: '2026-06-30', dm: 'Priyanka Paul', status: 'Done', workStatus: 'Content updated' },
  { taskType: 'Northstar Reserves — Plugin install', pm: 'Megha Dhara', date: '2026-07-01', dm: 'Moumita Manna', status: 'Pending', completion: 'Done' },
  { taskType: 'SAT Business Academy — Product Feed', pm: 'Jyotosmita', date: '2026-07-02', dm: 'Pinky', status: 'Done' },
  { taskType: 'Dr. Smile Sanpedro — Fix issues', pm: 'Sibam', date: '2026-07-06', dm: 'Pratiti', status: 'Pending', completion: 'Done' },
  { taskType: 'SAT Business Academy — POP up Form', pm: 'Jyotosmita', date: '2026-07-06', dm: 'Pinky', status: 'Pending', completion: 'Ongoing' },
  { taskType: 'Kosher Travelers — 404 redirect', pm: 'Akash', date: '2026-07-07', dm: 'Rohit', status: 'Pending' },
  { taskType: 'Dr. Smile Torrance — Fix issues', pm: 'Sibam', date: '2026-07-07', dm: 'Pratiti' },
];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

type Ctx = {
  tasks: MarketingTask[];
  ready: boolean;
  /** True while the first pull from the live database is still in flight. */
  syncing: boolean;
  /**
   * Pull the marketing sheet from the live database. Called on demand by the
   * Marketing page, so the marketing API is not hit on app load or on pages
   * that don't need it. Runs the network pull once per session.
   */
  ensureSynced: () => void;
  upsert: (t: MarketingTask) => MarketingTask | Promise<MarketingTask>;
  remove: (id: string) => void | Promise<void>;
  clear: () => void;
};

const C = createContext<Ctx | null>(null);

function taskToCells(t: MarketingTask): Record<string, string> {
  return {
    'Marketing Tasks Details': t.taskType || '',
    'PM Name': t.pm || '',
    'Date': t.date || '',
    'DM Person Name': t.dm || '',
    'Link / File': t.link || '',
    'Status': t.status || '',
    'Completion Status': t.completion || '',
    'Work Status': t.workStatus || '',
  };
}

function cellsToTask(rowUid: string, cells: Record<string, string>): MarketingTask {
  return {
    id: rowUid,
    taskType: cells['Marketing Tasks Details'] || cells['Task Details'] || cells['taskType'] || '',
    pm: cells['PM Name'] || cells['PM'] || '',
    date: cells['Date'] || '',
    dm: cells['DM Person Name'] || cells['DM'] || '',
    link: cells['Link / File'] || cells['Link'] || '',
    status: cells['Status'] || '',
    completion: cells['Completion Status'] || cells['Completion'] || '',
    workStatus: cells['Work Status'] || '',
  };
}

export function MarketingProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<MarketingTask[]>([]);
  const [ready, setReady] = useState(false);
  // See the note in store.tsx: `ready` means "cache read", `syncing` means the
  // authoritative database pull is still running.
  const [syncing, setSyncing] = useState(true);
  // Guards the on-demand pull so it runs at most once per session.
  const syncStarted = useRef(false);

  useEffect(() => {
    let list: MarketingTask[] = [];
    try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
    if (!list.length && !localStorage.getItem(SEED_FLAG)) {
      const now = Date.now();
      list = SEED.map((t, i) => ({ ...t, id: `seed-${i}`, createdAt: now - i * 1000, updatedAt: now - i * 1000 }));
      try {
        localStorage.setItem(KEY, JSON.stringify(list));
        localStorage.setItem(SEED_FLAG, '1');
      } catch {}
    }
    setTasks(list);
    setReady(true);

    // Synchronize with live database
    const syncDatabase = async () => {
      try {
        const res = await fetch('/api/sheet-sync/marketing');
        if (!res.ok) return;
        const data = await res.json();
        const dbTasks: MarketingTask[] = [];
        for (const sheet of data.sheets || []) {
          for (const row of sheet.rows || []) {
            dbTasks.push(cellsToTask(row.uid, row.cells));
          }
        }
        if (dbTasks.length > 0) {
          setTasks(dbTasks);
          try { localStorage.setItem(KEY, JSON.stringify(dbTasks)); } catch {}
        }
      } catch {}
    };

    syncDatabase();
  }, []);

  // Pull the marketing sheet from the live database — only when the Marketing
  // page asks, not on app load. Runs once per session; later calls are no-ops.
  const ensureSynced = useCallback(() => {
    if (syncStarted.current) return;
    syncStarted.current = true;
    (async () => {
      try {
        const res = await fetch('/api/sheet-sync/marketing');
        if (!res.ok) return;
        const data = await res.json();
        const dbTasks: MarketingTask[] = [];
        for (const sheet of data.sheets || []) {
          for (const row of sheet.rows || []) {
            dbTasks.push(cellsToTask(row.uid, row.cells));
          }
        }
        if (dbTasks.length > 0) {
          setTasks(dbTasks);
          try { localStorage.setItem(KEY, JSON.stringify(dbTasks)); } catch {}
        }
      } catch {}
      finally { setSyncing(false); }
    })();
  }, []);

  const persist = useCallback((next: MarketingTask[]) => {
    setTasks(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);

  const upsert = useCallback(async (t: MarketingTask) => {
    const list = tasks.slice();
    const now = Date.now();
    let targetId = t.id;
    if (!targetId) {
      targetId = uid();
      t.id = targetId;
    }

    const i = list.findIndex(x => x.id === targetId);
    if (i > -1) {
      t.createdAt = list[i].createdAt || now;
      t.updatedAt = now;
      list[i] = t;
    } else {
      t.createdAt = now;
      t.updatedAt = now;
      list.unshift(t);
    }

    persist(list);

    // Sync with live database
    try {
      const cells = taskToCells(t);
      if (t.id && i > -1) {
        await fetch('/api/sheet-rows/marketing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowUid: t.id, cells }),
        });
      } else {
        const res = await fetch('/api/sheet-rows/marketing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheetName: 'Marketing', cells }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.row?.uid) {
            t.id = json.row.uid;
            const updatedList = list.map(item => item.id === targetId ? { ...item, id: json.row.uid } : item);
            persist(updatedList);
          }
        }
      }
    } catch {}

    return t;
  }, [tasks, persist]);

  const remove = useCallback(async (id: string) => {
    persist(tasks.filter(t => t.id !== id));
    try {
      await fetch(`/api/sheet-rows/marketing?uid=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {}
  }, [tasks, persist]);

  const clear = useCallback(() => {
    setTasks([]);
    try {
      localStorage.removeItem(KEY);
      localStorage.setItem(SEED_FLAG, '1');
    } catch {}
  }, []);

  const value = useMemo(() => ({ tasks, ready, syncing, ensureSynced, upsert, remove, clear }), [tasks, ready, syncing, ensureSynced, upsert, remove, clear]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useMarketing() {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useMarketing outside <MarketingProvider>');
  return ctx;
}
