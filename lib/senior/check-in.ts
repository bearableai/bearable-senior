// Senior check-in logic
import { db } from '@/lib/db/client';
import { checkIns, relationships, users } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { sendSMS } from '@/lib/sms/twilio';

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
    .limit(3);

  if (recent.length < 3) return;

  const allBad = recent.every(r => !r.feelingOk);
  if (!allBad) return;

  // Get primary caretaker
  const [relationship] = await db
    .select({
      caretakerId: relationships.caretakerId,
    })
    .from(relationships)
    .where(and(
      eq(relationships.seniorId, userId),
      eq(relationships.status, 'active'),
    ))
    .limit(1);

  if (!relationship) return;

  const [caretaker] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, relationship.caretakerId))
    .limit(1);

  if (!caretaker?.phone) return;

  const [senior] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const seniorName = senior?.fullName || 'Your loved one';

  await sendSMS(
    caretaker.phone,
    `[Bearable Alert] ${seniorName} has reported not feeling well for 3 days in a row. You may want to check in.`,
  );

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
