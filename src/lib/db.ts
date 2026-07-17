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

export const pool: mysql.Pool = global.__dbPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  global.__dbPool = pool;
}

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
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}
