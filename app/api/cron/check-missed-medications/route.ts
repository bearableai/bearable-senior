import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { medicationReminders, medications, users, relationships } from '@/lib/db/schema';
import { eq, and, lt, isNull } from 'drizzle-orm';
import { sendSMS } from '@/lib/sms/twilio';

export const maxDuration = 60;

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
      timeZone: 'America/Chicago'
    });

    console.log(`[cron] Checking missed medications at ${currentTime} CT`);

    // Find reminders that should have been taken by now but weren't
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const missedReminders = await db
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
          lt(medicationReminders.scheduledTime, currentTime),
          isNull(medicationReminders.takenAt),
          eq(medicationReminders.missed, false)
        )
      );

    let notificationsSent = 0;

    for (const { reminder, medication, user } of missedReminders) {
      // Mark as missed
      await db
        .update(medicationReminders)
        .set({ missed: true })
        .where(eq(medicationReminders.id, reminder.id));

      // Send SMS reminder if phone exists
      if (user.phone) {
        try {
          await sendSMS(
            user.phone,
            `Reminder: Did you take your ${medication.name}? Reply YES if taken, or call if you need help.`
          );
          notificationsSent++;
        } catch (err) {
          console.error(`[cron] Failed to send SMS to ${user.id}:`, err);
        }
      }

      // Notify caretaker if 3+ missed in last 7 days
      const recentMissed = await db
        .select()
        .from(medicationReminders)
        .where(
          and(
            eq(medicationReminders.userId, reminder.userId),
            eq(medicationReminders.missed, true)
          )
        )
        .limit(7);

      if (recentMissed.length >= 3 && !reminder.caretakerNotified) {
        const caretakers = await db
          .select()
          .from(relationships)
          .innerJoin(users, eq(relationships.caretakerId, users.id))
          .where(eq(relationships.seniorId, reminder.userId));

        for (const rel of caretakers) {
          const caretakerPhone = rel.users.phone;
          if (caretakerPhone) {
            try {
              await sendSMS(
                caretakerPhone,
                `[Bearable Alert] ${user.fullName || 'Your senior'} has missed 3+ medications in the past week. Please check in with them.`
              );
            } catch (err) {
              console.error(`[cron] Failed to send caretaker SMS:`, err);
            }
          }
        }

        await db
          .update(medicationReminders)
          .set({ caretakerNotified: true })
          .where(eq(medicationReminders.id, reminder.id));
      }
    }

    return NextResponse.json({
      success: true,
      checked: missedReminders.length,
      notificationsSent,
      timestamp: now.toISOString(),
    });

  } catch (error) {
    console.error('[cron] Error checking medications:', error);
    return NextResponse.json({
      error: 'Failed to check medications',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
