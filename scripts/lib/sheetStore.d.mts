// Types for the shared .mjs storage layer, which is consumed both by the seeder
// (plain JS) and by src/lib/sheetData.ts (TypeScript).

import type { Connection, Pool, PoolConnection } from 'mysql2/promise';

type Conn = Pool | Connection | PoolConnection;

export declare const USER_ROW_INDEX_BASE: number;

export declare function parseJson<T>(value: unknown, fallback: T): T;

export declare function ensureTables(conn: Conn): Promise<void>;

export type SyncReport = {
  tabs: number;
  rows: number;
  matched: number;
  added: number;
  removed: number;
  userRows: number;
  byIdentityKey: number;
  byContentHash: number;
  tabsKept: number;
};

export declare function syncPageData(
  conn: Conn,
  pageKey: string,
  sheets: { name: string; headers: string[]; rows: Record<string, unknown>[] }[],
  syncedAt: number
): Promise<SyncReport>;

export declare function sweepOrphanExtras(conn: Conn, pageKey: string): Promise<number>;
