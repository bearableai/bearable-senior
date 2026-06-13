/**
 * Amazon Connect Voice Callback
 *
 * This endpoint receives POST requests from an Amazon Connect contact flow
 * (via a Lambda function or EventBridge rule) after a call completes.
 *
 * REQUIRED CONNECT CONTACT FLOW CONFIGURATION:
 * 1. Play TTS greeting: "Hi [name], this is Bear. How are you feeling today?"
 * 2. Record the caller's response (up to 60 seconds)
 * 3. Transcribe the recording (via Amazon Transcribe within Connect)
 * 4. Invoke a Lambda that POSTs the transcription + caller phone to this endpoint
 *
 * Expected POST body (JSON):
 * {
 *   "phoneNumber": "+1234567890",    // The senior's phone number
 *   "transcriptionText": "...",       // The transcribed text from the recording
 *   "recordingUrl": "s3://...",       // Optional: S3 URL of the recording
 *   "contactId": "abc-123"           // Optional: Connect contact ID for tracking
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { normalizePhone } from '@/lib/sms/twilio';
import { createCheckIn } from '@/lib/senior/check-in';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phoneNumber, transcriptionText, recordingUrl, contactId } = body;

    if (!phoneNumber) {
      return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    // Find the senior user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phone, normalizedPhone))
      .limit(1);

    if (!user) {
      console.error('[voice/connect-callback] User not found for phone:', normalizedPhone);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If we have transcription text, analyze sentiment and create check-in
    if (transcriptionText) {
      const sentiment = analyzeSentiment(transcriptionText);

      await createCheckIn(
        user.id,
        sentiment.feelingOk,
        recordingUrl || undefined,
        transcriptionText,
      );

      console.log(
        `[voice/connect-callback] Check-in created for ${user.id} — feelingOk: ${sentiment.feelingOk}, contactId: ${contactId || 'n/a'}`
      );

      return NextResponse.json({ status: 'check_in_created', feelingOk: sentiment.feelingOk });
    }

    // No transcription (maybe senior didn't speak) — create a neutral check-in with recording only
    if (recordingUrl) {
      await createCheckIn(user.id, true, recordingUrl, undefined);
      console.log(`[voice/connect-callback] Recording-only check-in for ${user.id}`);
      return NextResponse.json({ status: 'recording_saved' });
    }

    // Nothing useful received
    return NextResponse.json({ status: 'no_content' });

  } catch (error) {
    console.error('[voice/connect-callback] Error:', error);
    return NextResponse.json(
      { error: 'Internal error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/**
 * Simple sentiment analysis based on keyword matching.
 */
function analyzeSentiment(text: string): { feelingOk: boolean; concerns: string[] } {
  const lower = text.toLowerCase();

  const concernKeywords = [
    'bad', 'not good', 'not well', 'sick', 'pain', 'hurt', 'help',
    'dizzy', 'confused', 'scared', 'worse', 'terrible', 'awful',
    'lonely', 'sad', 'depressed', 'fell', 'fall', "can't sleep",
    'not eating', 'lost', 'weak',
  ];

  const positiveKeywords = [
    'good', 'great', 'fine', 'wonderful', 'okay', 'well', 'better',
    'happy', 'nice', 'lovely', 'enjoyed', 'slept well', 'ate well',
  ];

  const concerns = concernKeywords.filter(k => lower.includes(k));
  const positives = positiveKeywords.filter(k => lower.includes(k));

  const feelingOk = concerns.length === 0 || positives.length > concerns.length;

  return { feelingOk, concerns };
}
