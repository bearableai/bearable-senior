import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';
import { users } from '@/lib/db/schema';

export async function GET() {
  try {
    // Test database connection with simple query using drizzle query builder
    const result = await db.select().from(users).limit(1);

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      userCount: result.length,
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
