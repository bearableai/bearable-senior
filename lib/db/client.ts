import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Lazy initialization to avoid crashing at import time
let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getPool() {
  if (_pool) return _pool;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  return _pool;
}

export function getDb() {
  if (_db) return _db;

  const pool = getPool();
  _db = drizzle(pool, { schema });

  return _db;
}

// Export for backward compatibility
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get: (target, prop) => {
    const actualDb = getDb();
    return actualDb[prop as keyof typeof actualDb];
  }
});
