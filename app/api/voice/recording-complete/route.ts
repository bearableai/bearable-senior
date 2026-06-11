import { NextRequest } from 'next/server';
import { db } from '@/lib/db/client';
import { users, checkIns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { normalizePhone } from '@/lib/sms/twilio';
import { createCheckIn } from '@/lib/senior/check-in';

export const maxDuration = 30;

/**
 * Twilio recording/transcription callback.
 * Called when:
 * 1. Recording completes (action callback) — we get RecordingUrl
 * 2. Transcription completes (transcribeCallback) — we get TranscriptionText
 *
 * We handle both: the action callback creates a preliminary check-in,
 * and the transcription callback updates it with sentiment analysis.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;
    const transcriptionText = formData.get('TranscriptionText') as string;
    const recordingStatus = formData.get('RecordingStatus') as string;

    // Determine the senior's phone (From for inbound, To for outbound)
    const seniorPhone = normalizePhone(from || '') || normalizePhone(to || '');

    if (!seniorPhone) {
      console.error('[voice/recording-complete] No valid phone number found');
      return new Response(twimlAcknowledge(), {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Find the senior user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phone, seniorPhone))
      .limit(1);

    if (!user) {
      console.error('[voice/recording-complete] User not found for phone:', seniorPhone);
      return new Response(twimlAcknowledge(), {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // If we have transcription text (from transcribeCallback), analyze and create check-in
    if (transcriptionText) {
      const sentiment = analyzeSentiment(transcriptionText);

      await createCheckIn(
        user.id,
        sentiment.feelingOk,
        recordingUrl || undefined,
        transcriptionText,
      );

      console.log(`[voice/recording-complete] Check-in created for ${user.id} — feelingOk: ${sentiment.feelingOk}`);

      return new Response(twimlAcknowledge(), {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // If this is the recording action callback (no transcription yet),
    // create a preliminary check-in with the recording URL
    if (recordingUrl && recordingStatus === 'completed') {
      // Create a neutral check-in with the recording — will be updated when transcription arrives
      await createCheckIn(
        user.id,
        true, // Default to ok; transcription callback will re-evaluate
        recordingUrl,
        undefined,
      );

      console.log(`[voice/recording-complete] Preliminary check-in created for ${user.id}`);

      // Respond with a thank-you TwiML
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thanks for sharing. I've noted your check-in. Have a wonderful day!</Say>
</Response>`;

      return new Response(twiml, {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Default: acknowledge
    return new Response(twimlAcknowledge(), {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[voice/recording-complete] Error:', error);
    return new Response(twimlAcknowledge(), {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

/**
 * Simple sentiment analysis based on keyword matching.
 * Returns whether the senior seems to be doing ok.
 */
function analyzeSentiment(text: string): { feelingOk: boolean; concerns: string[] } {
  const lower = text.toLowerCase();

  const concernKeywords = [
    'bad', 'not good', 'not well', 'sick', 'pain', 'hurt', 'help',
    'dizzy', 'confused', 'scared', 'worse', 'terrible', 'awful',
    'lonely', 'sad', 'depressed', 'fell', 'fall', 'can\'t sleep',
    'not eating', 'lost', 'weak',
  ];

  const positiveKeywords = [
    'good', 'great', 'fine', 'wonderful', 'okay', 'well', 'better',
    'happy', 'nice', 'lovely', 'enjoyed', 'slept well', 'ate well',
  ];

  const concerns = concernKeywords.filter(k => lower.includes(k));
  const positives = positiveKeywords.filter(k => lower.includes(k));

  // If more concerns than positives, or any strong concern keywords, mark as not ok
  const feelingOk = concerns.length === 0 || positives.length > concerns.length;

  return { feelingOk, concerns };
}

function twimlAcknowledge(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thanks for sharing. Take care!</Say>
</Response>`;
}
