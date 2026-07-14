'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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
  upsert: (t: MarketingTask) => MarketingTask;
  remove: (id: string) => void;
  clear: () => void;
};

const C = createContext<Ctx | null>(null);

export function MarketingProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<MarketingTask[]>([]);
  const [ready, setReady] = useState(false);

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
  }, []);

  const persist = useCallback((next: MarketingTask[]) => {
    setTasks(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);

  const upsert = useCallback((t: MarketingTask) => {
    const list = tasks.slice();
    const now = Date.now();
    if (t.id) {
      const i = list.findIndex(x => x.id === t.id);
      if (i > -1) { t.createdAt = list[i].createdAt || now; t.updatedAt = now; list[i] = t; }
      else { t.createdAt = now; t.updatedAt = now; list.unshift(t); }
    } else {
      t.id = uid(); t.createdAt = now; t.updatedAt = now; list.unshift(t);
    }
    persist(list);
    return t;
  }, [tasks, persist]);

  const remove = useCallback((id: string) => persist(tasks.filter(t => t.id !== id)), [tasks, persist]);

  const clear = useCallback(() => {
    setTasks([]);
    try {
      localStorage.removeItem(KEY);
      localStorage.setItem(SEED_FLAG, '1');
    } catch {}
  }, []);

  const value = useMemo(() => ({ tasks, ready, upsert, remove, clear }), [tasks, ready, upsert, remove, clear]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useMarketing() {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useMarketing outside <MarketingProvider>');
  return ctx;
}
