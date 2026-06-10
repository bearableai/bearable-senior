import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    // Test database connection with simple query
    const result = await db.execute(sql`SELECT NOW() as current_time, 1 as test_value`);

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      result: result.rows,
      hasEnv: !!process.env.DATABASE_URL
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      database: 'failed',
      error: error.message,
      errorName: error.name,
      errorCode: error.code,
      stack: error.stack?.split('\n').slice(0, 3),
      hasEnv: !!process.env.DATABASE_URL
    }, { status: 500 });
  }
}
