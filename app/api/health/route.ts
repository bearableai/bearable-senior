import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';
import { loadRuntimeEnv } from '@/lib/env/runtime';

export async function GET() {
  try {
    // Load runtime environment from SSM
    await loadRuntimeEnv();

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
