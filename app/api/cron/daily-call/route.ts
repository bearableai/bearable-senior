import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const maxDuration = 60;

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!;

/**
 * Cron: Initiate daily outbound wellness calls to seniors.
 * Runs at 9:00 AM CT (14:00 UTC). Each senior with a phone number
 * receives a call that routes to /api/voice/inbound for the check-in flow.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[cron/daily-call] Initiating daily wellness calls...');

    // Get all seniors with phone numbers
    const seniors = await db
      .select({ id: users.id, phone: users.phone, fullName: users.fullName })
      .from(users)
      .where(eq(users.userType, 'senior'));

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bearable-senior.vercel.app';
    let callsInitiated = 0;
    let callsFailed = 0;

    for (const senior of seniors) {
      if (!senior.phone) continue;

      try {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
            },
            body: new URLSearchParams({
              To: senior.phone,
              From: FROM_NUMBER,
              Url: `${baseUrl}/api/voice/inbound`,
              StatusCallback: `${baseUrl}/api/voice/recording-complete`,
              Timeout: '30',
              MachineDetection: 'Enable',
            }).toString(),
          },
        );

        if (res.ok) {
          callsInitiated++;
          console.log(`[cron/daily-call] Call initiated to senior ${senior.id}`);
        } else {
          const err = await res.text();
          console.error(`[cron/daily-call] Failed to call senior ${senior.id}:`, err);
          callsFailed++;
        }
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
