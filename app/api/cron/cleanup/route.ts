import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { authSessions } from '@/lib/db/schema';
import { lt } from 'drizzle-orm';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[cron] Running cleanup...');

    // Delete expired sessions
    const now = new Date();
    const deletedSessions = await db
      .delete(authSessions)
      .where(lt(authSessions.expiresAt, now))
      .returning();

    console.log(`[cron] Deleted ${deletedSessions.length} expired sessions`);

    return NextResponse.json({
      success: true,
      deletedSessions: deletedSessions.length,
      timestamp: now.toISOString(),
    });

  } catch (error) {
    console.error('[cron] Error during cleanup:', error);
    return NextResponse.json({
      error: 'Cleanup failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
