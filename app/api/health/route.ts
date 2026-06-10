import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    // Simple database connectivity test
    const result = await db.execute(sql`SELECT 1 as test`);

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      test: result.rows[0],
      hasEnv: !!process.env.DATABASE_URL
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      database: 'failed',
      error: error.message,
      hasEnv: !!process.env.DATABASE_URL
    }, { status: 500 });
  }
}
