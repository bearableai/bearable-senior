import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { initiateOutboundCall } from '@/lib/voice/aws-connect';

export const maxDuration = 60;

/**
 * Cron: Initiate daily outbound wellness calls to seniors via Amazon Connect.
 * Runs at 9:00 AM CT (14:00 UTC). Each senior with a phone number
 * receives a call through the Connect contact flow, which handles
 * the greeting, recording, transcription, and callback to /api/voice/connect-callback.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[cron/daily-call] Initiating daily wellness calls via Amazon Connect...');

    // Get all seniors with phone numbers
    const seniors = await db
      .select({ id: users.id, phone: users.phone, fullName: users.fullName })
      .from(users)
      .where(eq(users.userType, 'senior'));

    let callsInitiated = 0;
    let callsFailed = 0;

    for (const senior of seniors) {
      if (!senior.phone) continue;

      try {
        await initiateOutboundCall(senior.phone);
        callsInitiated++;
        console.log(`[cron/daily-call] Call initiated to senior ${senior.id}`);
      } catch (err) {
        console.error(`[cron/daily-call] Error calling senior ${senior.id}:`, err);
        callsFailed++;
      }
    }

    return NextResponse.json({
      success: true,
      callsInitiated,
      callsFailed,
      totalSeniors: seniors.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron/daily-call] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to initiate daily calls',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
