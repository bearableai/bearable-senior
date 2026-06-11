import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { checkIns, users, relationships } from '@/lib/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { sendSMS } from '@/lib/sms/twilio';
import {
  shouldSendNotification,
  generateWeeklySummary,
  NotificationLevel,
} from '@/lib/escalation/tiered';

export const maxDuration = 60;

/**
 * Weekly Summary Cron - runs on Sundays at 10:00 AM CT.
 * Sends informational tier digests to caretakers who have opted in to 'all' notifications.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[cron] Generating weekly informational summaries...');

    // Get all active relationships
    const activeRelationships = await db
      .select({
        seniorId: relationships.seniorId,
        caretakerId: relationships.caretakerId,
        notificationLevel: relationships.notificationLevel,
        label: relationships.label,
      })
      .from(relationships)
      .where(eq(relationships.status, 'active'));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let summariesSent = 0;
    let skippedByPreference = 0;

    for (const rel of activeRelationships) {
      const notificationLevel = (rel.notificationLevel || 'advisory_and_urgent') as NotificationLevel;

      // Gate: only send informational to caretakers who opted into 'all'
      if (!shouldSendNotification('informational', notificationLevel)) {
        skippedByPreference++;
        continue;
      }

      // Get caretaker phone
      const [caretaker] = await db
        .select({ phone: users.phone })
        .from(users)
        .where(eq(users.id, rel.caretakerId))
        .limit(1);

      if (!caretaker?.phone) continue;

      // Get senior info
      const [senior] = await db
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, rel.seniorId))
        .limit(1);

      const seniorName = senior?.fullName || rel.label || 'your loved one';

      // Get last 7 days of check-ins for this senior
      const recentCheckIns = await db
        .select()
        .from(checkIns)
        .where(
          and(
            eq(checkIns.userId, rel.seniorId),
            gte(checkIns.createdAt, sevenDaysAgo)
          )
        )
        .orderBy(desc(checkIns.createdAt));

      if (recentCheckIns.length === 0) continue;

      const totalCheckIns = recentCheckIns.length;
      const goodDays = recentCheckIns.filter((c) => c.feelingOk).length;
      const badDays = totalCheckIns - goodDays;

      const message = generateWeeklySummary(seniorName, totalCheckIns, goodDays, badDays);

      try {
        await sendSMS(caretaker.phone, message);
        summariesSent++;
      } catch (err) {
        console.error(`[cron] Failed to send weekly summary:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      summariesSent,
      skippedByPreference,
      totalRelationships: activeRelationships.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron] Error generating weekly summaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate weekly summaries',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
