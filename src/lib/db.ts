import mysql from 'mysql2/promise';

// Server-only MySQL/MariaDB connection pool.
// Credentials are read from environment variables (see .env.local).
//
// Reuse a single pool across hot-reloads in dev by stashing it on globalThis;
// otherwise Next.js would open a new pool on every module reload.

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: mysql.Pool | undefined;
}

function createPool(): mysql.Pool {
  const {
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
  } = process.env;

  if (!DB_HOST || !DB_USER || !DB_NAME) {
    throw new Error(
      'Missing database configuration. Set DB_HOST, DB_USER, DB_PASSWORD and DB_NAME in .env.local'
    );
  }

  return mysql.createPool({
    host: DB_HOST,
    port: DB_PORT ? Number(DB_PORT) : 3306,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
  });
}

// Lazily create the pool on first use rather than at import time. This keeps
// `next build` from touching the database (and throwing on missing env vars)
// while it collects route metadata.
export function getPool(): mysql.Pool {
  if (global.__dbPool) return global.__dbPool;
  const created = createPool();
  global.__dbPool = created;
  return created;
}

// Backwards-compatible `pool` export. It's a Proxy so member access
// (`pool.query`, `pool.getConnection`, …) resolves the real pool lazily on
// first use — importing this module never opens a connection or reads env vars.
export const pool: mysql.Pool = new Proxy({} as mysql.Pool, {
  get(_target, prop, receiver) {
    const real = getPool();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

/**
 * Run a parameterized query and return the typed rows.
 *
 * @example
 *   const rows = await query<{ id: number; name: string }>(
 *     'SELECT id, name FROM projects WHERE status = ?', ['live']
 *   );
 */
export async function query<T = mysql.RowDataPacket[]>(
  sql: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<T> {
  const [rows] = await getPool().execute(sql, params);
  return rows as T;
}
