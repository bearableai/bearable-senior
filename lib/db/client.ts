import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { loadRuntimeEnv } from '@/lib/env/runtime';

// Singleton instances
let pool: Pool | undefined;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;
let envLoaded = false;

async function ensureEnvLoaded() {
  if (!envLoaded) {
    await loadRuntimeEnv();
    envLoaded = true;
  }
}

async function getDbInstance() {
  if (dbInstance) return dbInstance;

  await ensureEnvLoaded();

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Always use SSL for Aurora
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  dbInstance = drizzle(pool, { schema });
  return dbInstance;
}

// Export async getter function
export async function getDb() {
  return await getDbInstance();
}

// For backward compatibility - create async proxy
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    // Return a function that ensures env is loaded first
    return async function(...args: any[]) {
      const instance = await getDbInstance();
      const method = (instance as any)[prop];
      if (typeof method === 'function') {
        return method.apply(instance, args);
      }
      return method;
    };
  },
}) as any;
