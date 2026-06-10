import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { checkIns, users, relationships } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { runSafetyGate } from '@/lib/privacy/prompt-injection';
import { checkForPII } from '@/lib/privacy/deidentify';
import { healthEscalationConsensus } from '@/lib/ai/multi-agent';
import { sendSMS } from '@/lib/sms/twilio';

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { feelingOk, voiceNoteText } = body;

    if (typeof feelingOk !== 'boolean') {
      return NextResponse.json({ error: 'feelingOk required' }, { status: 400 });
    }

    let safeVoiceNote = voiceNoteText || null;

    // Privacy Gate 1: Prompt injection check
    if (voiceNoteText) {
      const safetyCheck = runSafetyGate(voiceNoteText);
      if (safetyCheck.blocked) {
        return NextResponse.json({
          error: 'Input blocked: unsafe content detected. Please rephrase your message.'
        }, { status: 400 });
      }

      // Privacy Gate 2: PII redaction
      const piiCheck = checkForPII(safetyCheck.sanitizedInput);
      if (piiCheck.found) {
        console.log(`[check-in] PII detected and redacted: ${piiCheck.piiTypes.join(', ')}`);
      }
      safeVoiceNote = piiCheck.redacted;
    }

    // Store check-in
    const [checkIn] = await db.insert(checkIns).values({
      userId,
      feelingOk,
      voiceNoteText: safeVoiceNote,
    }).returning();

    // Privacy Gate 3: Multi-agent escalation consensus (async, non-blocking)
    if (!feelingOk) {
      // Fetch recent check-ins
      const recentCheckIns = await db
        .select()
        .from(checkIns)
        .where(eq(checkIns.userId, userId))
        .orderBy(desc(checkIns.createdAt))
        .limit(7);

      // Map to required format for multi-agent consensus
      const checkInData = recentCheckIns.map(c => ({
        feelingOk: c.feelingOk,
        createdAt: c.createdAt!,
        voiceNoteText: c.voiceNoteText,
      }));

      // Run multi-agent consensus (runs in background)
      healthEscalationConsensus(userId, checkInData).then(async (result) => {
        if (result.consensus && result.confidence >= 0.6) {
          // Alert caretakers
          const caretakers = await db
            .select()
            .from(relationships)
            .innerJoin(users, eq(relationships.caretakerId, users.id))
            .where(eq(relationships.seniorId, userId));

          for (const rel of caretakers) {
            const caretakerPhone = rel.users.phone;
            if (caretakerPhone) {
              const senior = await db.query.users.findFirst({
                where: eq(users.id, userId),
              });

              await sendSMS(
                caretakerPhone,
                `[Bearable Alert] ${senior?.fullName || 'Your senior'} needs attention. Reason: ${result.reasons[0]?.split(': ')[1] || 'Multiple concerning check-ins'}. Confidence: ${Math.round(result.confidence * 100)}%. Please check in with them.`
              );
            }
          }

          // Mark as notified
          await db.update(checkIns)
            .set({ caretakerNotified: true })
            .where(eq(checkIns.id, checkIn.id));
        }
      }).catch((err) => {
        console.error('[check-in] Multi-agent consensus failed:', err);
      });
    }

    return NextResponse.json({
      success: true,
      checkIn: {
        id: checkIn.id,
        feelingOk: checkIn.feelingOk,
        createdAt: checkIn.createdAt,
      }
    });

  } catch (error) {
    console.error('[check-in] Error:', error);
    return NextResponse.json({
      error: 'Failed to record check-in'
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recentCheckIns = await db
      .select()
      .from(checkIns)
      .where(eq(checkIns.userId, userId))
      .orderBy(desc(checkIns.createdAt))
      .limit(30);

    return NextResponse.json({ checkIns: recentCheckIns });

  } catch (error) {
    console.error('[check-in] Error fetching:', error);
    return NextResponse.json({
      error: 'Failed to fetch check-ins'
    }, { status: 500 });
  }
}
