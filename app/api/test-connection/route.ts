import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function GET() {
  let pool: Pool | undefined;

  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({
        status: 'error',
        message: 'DATABASE_URL not set'
      }, { status: 500 });
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    const result = await pool.query('SELECT NOW() as time, version() as pg_version');

    await pool.end();

    return NextResponse.json({
      status: 'ok',
      connected: true,
      time: result.rows[0].time,
      pgVersion: result.rows[0].pg_version?.substring(0, 50)
    });
  } catch (error: any) {
    if (pool) await pool.end().catch(() => {});

    return NextResponse.json({
      status: 'error',
      connected: false,
      error: error.message,
      code: error.code,
      detail: error.detail
    }, { status: 500 });
  }
}
