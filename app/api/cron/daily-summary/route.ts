import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { checkIns, users, relationships } from '@/lib/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { sendSMS } from '@/lib/sms/twilio';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[cron] Generating daily summaries...');

    // Get all seniors with caretakers
    const seniorsWithCaretakers = await db
      .select({
        senior: users,
        caretaker: users,
      })
      .from(relationships)
      .innerJoin(users, eq(relationships.seniorId, users.id))
      .innerJoin(users, eq(relationships.caretakerId, users.id))
      .where(eq(relationships.status, 'active'));

    let summariesSent = 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const { senior, caretaker } of seniorsWithCaretakers) {
      // Get last 7 days of check-ins
      const recentCheckIns = await db
        .select()
        .from(checkIns)
        .where(
          and(
            eq(checkIns.userId, senior.id),
            gte(checkIns.createdAt, sevenDaysAgo)
          )
        )
        .orderBy(desc(checkIns.createdAt));

      if (recentCheckIns.length === 0) continue;

      const totalDays = recentCheckIns.length;
      const goodDays = recentCheckIns.filter(c => c.feelingOk).length;
      const concerningDays = totalDays - goodDays;
      const checkInRate = Math.round((totalDays / 7) * 100);

      // Only send summary if caretaker has phone
      if (caretaker.phone) {
        let message = `Weekly Update for ${senior.fullName || 'your loved one'}:\n`;
        message += `✅ ${goodDays}/${totalDays} days feeling good (${checkInRate}% check-in rate)\n`;

        if (concerningDays > 0) {
          message += `⚠️ ${concerningDays} concerning days\n`;
        }

        if (checkInRate < 70) {
          message += `\n📱 Low check-in rate - consider reaching out`;
        }

        try {
          await sendSMS(caretaker.phone, message);
          summariesSent++;
        } catch (err) {
          console.error(`[cron] Failed to send summary to caretaker:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      summariesSent,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[cron] Error generating summaries:', error);
    return NextResponse.json({
      error: 'Failed to generate summaries',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
