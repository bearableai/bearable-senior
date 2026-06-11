// Senior check-in logic
import { db } from '@/lib/db/client';
import { checkIns, relationships, users } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { sendSMS } from '@/lib/sms/twilio';
import {
  determineEscalationTier,
  shouldSendNotification,
  generateAdvisoryMessage,
  NotificationLevel,
} from '@/lib/escalation/tiered';
import { detectTrends } from '@/lib/health/pattern-detection';

export interface CheckIn {
  id: string;
  userId: string;
  feelingOk: boolean;
  voiceNoteUrl: string | null;
  voiceNoteText: string | null;
  caretakerNotified: boolean;
  createdAt: Date;
}

export async function createCheckIn(
  userId: string,
  feelingOk: boolean,
  voiceNoteUrl?: string,
  voiceNoteText?: string,
): Promise<CheckIn> {
  const [checkIn] = await db
    .insert(checkIns)
    .values({
      userId,
      feelingOk,
      voiceNoteUrl: voiceNoteUrl || null,
      voiceNoteText: voiceNoteText || null,
      caretakerNotified: false,
    })
    .returning();

  if (!feelingOk) {
    await checkEscalationPattern(userId, checkIn.id);
  }

  // Run 14-day trend detection on every check-in (async, non-blocking)
  runTrendDetection(userId).catch(err => {
    console.error('[check-in] Trend detection failed:', err);
  });

  return {
    id: checkIn.id,
    userId: checkIn.userId,
    feelingOk: checkIn.feelingOk,
    voiceNoteUrl: checkIn.voiceNoteUrl,
    voiceNoteText: checkIn.voiceNoteText,
    caretakerNotified: checkIn.caretakerNotified ?? false,
    createdAt: checkIn.createdAt!,
  };
}

async function checkEscalationPattern(userId: string, checkInId: string): Promise<void> {
  const recent = await db
    .select()
    .from(checkIns)
    .where(eq(checkIns.userId, userId))
    .orderBy(desc(checkIns.createdAt))
    .limit(7);

  if (recent.length < 3) return;

  // Determine escalation tier based on check-in pattern
  const checkInData = recent.map(r => ({
    feelingOk: r.feelingOk,
    createdAt: r.createdAt!,
  }));

  const tier = determineEscalationTier(checkInData);
  if (!tier) return;

  // Get all active caretaker relationships
  const caretakerRelationships = await db
    .select({
      caretakerId: relationships.caretakerId,
      notificationLevel: relationships.notificationLevel,
    })
    .from(relationships)
    .where(and(
      eq(relationships.seniorId, userId),
      eq(relationships.status, 'active'),
    ));

  if (caretakerRelationships.length === 0) return;

  const [senior] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const seniorName = senior?.fullName || 'Your loved one';

  for (const rel of caretakerRelationships) {
    const notificationLevel = (rel.notificationLevel || 'advisory_and_urgent') as NotificationLevel;

    // Gate: only send if caretaker's level permits this tier
    if (!shouldSendNotification(tier, notificationLevel)) continue;

    const [caretaker] = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, rel.caretakerId))
      .limit(1);

    if (!caretaker?.phone) continue;

    let message: string;
    if (tier === 'urgent') {
      message = `[Bearable Alert] ${seniorName} has reported not feeling well for 3 days in a row. You may want to check in.`;
    } else {
      // advisory
      const badDays = recent.filter(r => !r.feelingOk).length;
      message = generateAdvisoryMessage(seniorName, badDays);
    }

    try {
      await sendSMS(caretaker.phone, message);
    } catch (err) {
      console.error(`[escalation] Failed to send ${tier} SMS to caretaker:`, err);
    }
  }

  await db
    .update(checkIns)
    .set({ caretakerNotified: true })
    .where(eq(checkIns.id, checkInId));
}

export async function getRecentCheckIns(userId: string, days: number = 7): Promise<CheckIn[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await db
    .select()
    .from(checkIns)
    .where(and(
      eq(checkIns.userId, userId),
      sql`${checkIns.createdAt} >= ${cutoff}`,
    ))
    .orderBy(desc(checkIns.createdAt))
    .limit(30);

  return rows.map(r => ({
    id: r.id,
    userId: r.userId,
    feelingOk: r.feelingOk,
    voiceNoteUrl: r.voiceNoteUrl,
    voiceNoteText: r.voiceNoteText,
    caretakerNotified: r.caretakerNotified ?? false,
    createdAt: r.createdAt!,
  }));
}

/**
 * Run 14-day trend detection and trigger advisory notifications if declining.
 */
async function runTrendDetection(userId: string): Promise<void> {
  const trendReport = await detectTrends(userId);

  // Only act on advisory or urgent severity
  if (trendReport.severity === 'none') return;

  // Get caretaker relationships
  const caretakerRelationships = await db
    .select({
      caretakerId: relationships.caretakerId,
      notificationLevel: relationships.notificationLevel,
    })
    .from(relationships)
    .where(and(
      eq(relationships.seniorId, userId),
      eq(relationships.status, 'active'),
    ));

  if (caretakerRelationships.length === 0) return;

  const [senior] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const seniorName = senior?.fullName || 'Your loved one';
  const tier = trendReport.severity === 'urgent' ? 'urgent' as const : 'advisory' as const;

  for (const rel of caretakerRelationships) {
    const notificationLevel = (rel.notificationLevel || 'advisory_and_urgent') as NotificationLevel;

    if (!shouldSendNotification(tier, notificationLevel)) continue;

    const [caretaker] = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, rel.caretakerId))
      .limit(1);

    if (!caretaker?.phone) continue;

    const message = `[Bearable Trend Update] ${seniorName}: ${trendReport.summary}`;

    try {
      await sendSMS(caretaker.phone, message);
    } catch (err) {
      console.error('[trend-detection] Failed to send trend notification:', err);
    }
  }
}
