import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Singleton pattern for database connection
let _db: ReturnType<typeof drizzle> | null = null;

function createDbConnection() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  return drizzle(pool, { schema });
}

// Lazy getter - creates connection on first access
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get: (target, prop) => {
    if (!_db) {
      _db = createDbConnection();
    }
    const value = (_db as any)[prop];
    return typeof value === 'function' ? value.bind(_db) : value;
  }
}) as ReturnType<typeof drizzle<typeof schema>>;
