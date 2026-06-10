import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    // Get database instance (automatically loads env from SSM)
    const db = await getDb();

    // Simple database connectivity test
    const result = await db.execute(sql`SELECT 1 as test`);

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      test: result.rows[0]
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      database: 'failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
