import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, checkIns, medicationReminders } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { normalizePhone } from '@/lib/sms/twilio';
import { runSafetyGate } from '@/lib/privacy/prompt-injection';
import { checkForPII } from '@/lib/privacy/deidentify';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    // Parse Twilio form data
    const formData = await req.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;

    // Rate limiting by phone: 20 SMS per hour per number
    if (from) {
      const normalizedPhone = normalizePhone(from);
      if (normalizedPhone) {
        const rateLimit = checkRateLimit(`sms-inbound:${normalizedPhone}`, {
          maxRequests: 20,
          windowMs: 60 * 60 * 1000, // 1 hour
        });

        if (!rateLimit.allowed) {
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You've sent too many messages. Please wait before sending more.</Message>
</Response>`,
            { headers: { 'Content-Type': 'text/xml', ...getRateLimitHeaders(rateLimit) } }
          );
        }
      }
    }

    if (!from || !body) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    const normalizedPhone = normalizePhone(from);
    if (!normalizedPhone) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Find user by phone
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phone, normalizedPhone))
      .limit(1);

    if (!user) {
      // Unknown number - reply with signup info
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Welcome to Bearable Senior! Visit bearable-senior.vercel.app to sign up.</Message>
</Response>`,
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    const message = body.trim().toLowerCase();

    // Handle medication confirmation
    if (message === 'yes' || message === 'taken' || message === 'done') {
      // Find most recent missed medication reminder
      const [reminder] = await db
        .select()
        .from(medicationReminders)
        .where(eq(medicationReminders.userId, user.id))
        .orderBy(desc(medicationReminders.scheduledTime))
        .limit(1);

      if (reminder && !reminder.takenAt) {
        await db
          .update(medicationReminders)
          .set({ takenAt: new Date(), missed: false })
          .where(eq(medicationReminders.id, reminder.id));

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Great! Medication marked as taken. ✓</Message>
</Response>`,
          { headers: { 'Content-Type': 'text/xml' } }
        );
      }
    }

    // Privacy Gate 1: Prompt injection check
    const safetyCheck = runSafetyGate(body);
    if (safetyCheck.blocked) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>I'm sorry, I couldn't process that message. Please rephrase.</Message>
</Response>`,
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    // Privacy Gate 2: PII redaction
    const piiCheck = checkForPII(safetyCheck.sanitizedInput);
    const safeText = piiCheck.redacted;

    // Determine sentiment (simple keyword check)
    const concernKeywords = ['bad', 'not good', 'not well', 'sick', 'pain', 'hurt', 'help'];
    const goodKeywords = ['good', 'great', 'fine', 'ok', 'okay', 'well'];

    const hasConcern = concernKeywords.some(k => message.includes(k));
    const isGood = goodKeywords.some(k => message.includes(k));

    // Create check-in
    await db.insert(checkIns).values({
      userId: user.id,
      feelingOk: isGood && !hasConcern,
      voiceNoteText: safeText,
    });

    // Reply based on sentiment
    let reply = 'Thanks for checking in! ';
    if (hasConcern) {
      reply += "I hear you. I've noted how you're feeling, and your family is here for you if needed.";
    } else {
      reply += "I'm glad you're doing well today!";
    }

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${reply}</Message>
</Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    );

  } catch (error) {
    console.error('[sms/inbound] Error:', error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, something went wrong. Please try again later.</Message>
</Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    );
  }
}
