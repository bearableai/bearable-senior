import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, checkIns, medicationReminders } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { normalizePhone } from '@/lib/sms/twilio';
import { sendSMS } from '@/lib/sms/aws-sns';
import { runSafetyGate } from '@/lib/privacy/prompt-injection';
import { checkForPII } from '@/lib/privacy/deidentify';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

export const maxDuration = 30;

/**
 * Inbound SMS handler via AWS SNS.
 *
 * AWS setup: Provision a phone number in Amazon Pinpoint, configure it to publish
 * inbound SMS to an SNS topic, then create an HTTPS subscription pointing to this endpoint.
 *
 * SNS sends three types of requests:
 * 1. SubscriptionConfirmation — we must GET the SubscribeURL to confirm
 * 2. Notification — the actual inbound SMS payload
 * 3. UnsubscribeConfirmation — acknowledgement only
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(body);
    } catch {
      // Not JSON — return 400
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Handle SNS SubscriptionConfirmation
    if (payload.Type === 'SubscriptionConfirmation') {
      const subscribeUrl = payload.SubscribeURL as string;
      if (subscribeUrl) {
        await fetch(subscribeUrl);
        console.log('[sms/inbound] SNS subscription confirmed');
      }
      return NextResponse.json({ status: 'confirmed' });
    }

    // Handle UnsubscribeConfirmation
    if (payload.Type === 'UnsubscribeConfirmation') {
      console.log('[sms/inbound] SNS unsubscribe confirmation received');
      return NextResponse.json({ status: 'ok' });
    }

    // Handle SNS Notification (the actual inbound SMS)
    if (payload.Type !== 'Notification') {
      return NextResponse.json({ error: 'Unknown SNS type' }, { status: 400 });
    }

    // Parse the SNS message — Pinpoint sends JSON with originationNumber and messageBody
    let snsMessage: Record<string, unknown>;
    try {
      snsMessage = JSON.parse(payload.Message as string);
    } catch {
      console.error('[sms/inbound] Failed to parse SNS Message body');
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
    }

    const from = (snsMessage.originationNumber as string) || '';
    const messageBody = (snsMessage.messageBody as string) || '';

    if (!from || !messageBody) {
      return NextResponse.json({ status: 'ignored' });
    }

    const normalizedPhone = normalizePhone(from);
    if (!normalizedPhone) {
      return NextResponse.json({ status: 'ignored' });
    }

    // Rate limiting by phone: 20 SMS per hour per number
    const rateLimit = checkRateLimit(`sms-inbound:${normalizedPhone}`, {
      maxRequests: 20,
      windowMs: 60 * 60 * 1000, // 1 hour
    });

    if (!rateLimit.allowed) {
      await sendSMS(normalizedPhone, "You've sent too many messages. Please wait before sending more.");
      return NextResponse.json(
        { error: 'Rate limited' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    // Find user by phone
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phone, normalizedPhone))
      .limit(1);

    if (!user) {
      await sendSMS(normalizedPhone, 'Welcome to Bearable Senior! Visit bearable-senior.vercel.app to sign up.');
      return NextResponse.json({ status: 'unknown_user' });
    }

    const message = messageBody.trim().toLowerCase();

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

        await sendSMS(normalizedPhone, 'Great! Medication marked as taken.');
        return NextResponse.json({ status: 'medication_confirmed' });
      }
    }

    // Privacy Gate 1: Prompt injection check
    const safetyCheck = runSafetyGate(messageBody);
    if (safetyCheck.blocked) {
      await sendSMS(normalizedPhone, "I'm sorry, I couldn't process that message. Please rephrase.");
      return NextResponse.json({ status: 'blocked' });
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

    await sendSMS(normalizedPhone, reply);
    return NextResponse.json({ status: 'check_in_created' });

  } catch (error) {
    console.error('[sms/inbound] Error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
