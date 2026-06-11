import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { medicationReminders, medications, users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { sendSMS } from '@/lib/sms/twilio';

export const maxDuration = 60;

/**
 * Cron: Send outbound medication reminders at their scheduled time.
 * Runs every 5 minutes. Finds reminders whose scheduledTime matches the
 * current 5-minute window and haven't been sent yet today.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Chicago',
    });

    // Build a 5-minute window: e.g., if it's 08:02, match 08:00-08:04
    const [hourStr, minStr] = currentTime.split(':');
    const hour = parseInt(hourStr, 10);
    const min = parseInt(minStr, 10);
    const windowStart = `${String(hour).padStart(2, '0')}:${String(Math.floor(min / 5) * 5).padStart(2, '0')}`;
    const windowEndMin = Math.floor(min / 5) * 5 + 4;
    const windowEnd = windowEndMin >= 60
      ? `${String(hour + 1).padStart(2, '0')}:${String(windowEndMin - 60).padStart(2, '0')}`
      : `${String(hour).padStart(2, '0')}:${String(windowEndMin).padStart(2, '0')}`;

    console.log(`[cron] Sending medication reminders for window ${windowStart}-${windowEnd} CT`);

    // Find reminders that match this time window and haven't been sent today
    const dueReminders = await db
      .select({
        reminder: medicationReminders,
        medication: medications,
        user: users,
      })
      .from(medicationReminders)
      .innerJoin(medications, eq(medicationReminders.medicationId, medications.id))
      .innerJoin(users, eq(medicationReminders.userId, users.id))
      .where(
        and(
          isNull(medicationReminders.reminderSentAt),
          isNull(medicationReminders.takenAt),
          eq(medicationReminders.missed, false)
        )
      );

    // Filter to those in the current time window
    const matchingReminders = dueReminders.filter(({ reminder }) => {
      return reminder.scheduledTime >= windowStart && reminder.scheduledTime <= windowEnd;
    });

    let sentCount = 0;

    for (const { reminder, medication, user } of matchingReminders) {
      if (!user.phone) continue;

      const firstName = user.fullName?.split(' ')[0] || 'there';
      const message = `Hi ${firstName}, time for your ${medication.name}. Reply TAKEN when done.`;

      try {
        await sendSMS(user.phone, message);

        // Mark reminder as sent
        await db
          .update(medicationReminders)
          .set({ reminderSentAt: new Date() })
          .where(eq(medicationReminders.id, reminder.id));

        sentCount++;
      } catch (err) {
        console.error(`[cron] Failed to send reminder to ${user.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      window: `${windowStart}-${windowEnd}`,
      checked: dueReminders.length,
      sent: sentCount,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('[cron] Error sending medication reminders:', error);
    return NextResponse.json(
      {
        error: 'Failed to send medication reminders',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
