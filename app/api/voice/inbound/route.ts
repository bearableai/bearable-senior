import { NextRequest } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { normalizePhone } from '@/lib/sms/twilio';

export const maxDuration = 30;

/**
 * Twilio Voice webhook — answers inbound/outbound calls with a greeting,
 * then records up to 60 seconds of the senior's response.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const calledNumber = formData.get('To') as string;
    const callerNumber = formData.get('From') as string;

    // Determine which number belongs to the senior
    // For outbound calls, "To" is the senior; for inbound, "From" is
    const seniorPhone = normalizePhone(callerNumber || calledNumber || '');

    let firstName = 'there';

    if (seniorPhone) {
      const [user] = await db
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.phone, seniorPhone))
        .limit(1);

      if (user?.fullName) {
        firstName = user.fullName.split(' ')[0];
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bearable-senior.vercel.app';

    // Respond with TwiML: greet, then record up to 60 seconds
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Hi ${firstName}, this is Bear. How are you feeling today? Tell me a bit about your day.</Say>
  <Record
    maxLength="60"
    playBeep="true"
    transcribe="true"
    transcribeCallback="${baseUrl}/api/voice/recording-complete"
    action="${baseUrl}/api/voice/recording-complete"
    finishOnKey="#"
    timeout="5"
  />
  <Say voice="Polly.Joanna">I didn't hear anything. No worries — you can always text me instead. Take care!</Say>
</Response>`;

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[voice/inbound] Error:', error);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Sorry, I'm having trouble right now. Please try again later or send a text. Take care!</Say>
</Response>`;

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
