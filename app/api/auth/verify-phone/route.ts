import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendSMS, generateVerifyCode } from '@/lib/sms/twilio';
import { checkRateLimit, getClientIp, getRateLimitHeaders } from '@/lib/rate-limit';

// In-memory store for verification codes (5 minute expiry)
// Production: use Redis or database table
const verificationCodes = new Map<string, { code: string; expiresAt: number; userId?: string }>();

// Clean up expired codes every minute
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of verificationCodes.entries()) {
    if (data.expiresAt < now) {
      verificationCodes.delete(phone);
    }
  }
}, 60000);

export async function POST(req: NextRequest) {
  try {
    // Rate limiting by IP: 5 requests per 15 minutes
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(`verify-phone:${clientIp}`, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please try again later.' },
        {
          status: 429,
          headers: getRateLimitHeaders(rateLimit),
        }
      );
    }

    const body = await req.json();
    const { phone, code, action, userId } = body;

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    // ACTION: send - Send verification code
    if (action === 'send') {
      // Additional rate limit for SMS sends by phone: 3 per hour
      const phoneLimit = checkRateLimit(`verify-phone:send:${phone}`, {
        maxRequests: 3,
        windowMs: 60 * 60 * 1000, // 1 hour
      });

      if (!phoneLimit.allowed) {
        return NextResponse.json(
          { error: 'Too many SMS sent to this number. Please try again in an hour.' },
          { status: 429, headers: getRateLimitHeaders(phoneLimit) }
        );
      }
      const verifyCode = generateVerifyCode();
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

      verificationCodes.set(phone, {
        code: verifyCode,
        expiresAt,
        userId, // Optional: associate with user being created
      });

      try {
        await sendSMS(phone, `Your Bearable Senior verification code is: ${verifyCode}`);
        return NextResponse.json({ success: true, message: 'Verification code sent' });
      } catch (error) {
        console.error('[verify-phone] SMS send failed:', error);
        return NextResponse.json({
          error: 'Failed to send SMS. Please check phone number.',
        }, { status: 500 });
      }
    }

    // ACTION: verify - Check verification code
    if (action === 'verify') {
      if (!code) {
        return NextResponse.json({ error: 'Verification code required' }, { status: 400 });
      }

      const stored = verificationCodes.get(phone);

      if (!stored) {
        return NextResponse.json({ error: 'No verification code found. Please request a new one.' }, { status: 400 });
      }

      if (stored.expiresAt < Date.now()) {
        verificationCodes.delete(phone);
        return NextResponse.json({ error: 'Verification code expired. Please request a new one.' }, { status: 400 });
      }

      if (stored.code !== code) {
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
      }

      // Code is valid - update user's phone if userId provided
      if (stored.userId) {
        await db
          .update(users)
          .set({ phone })
          .where(eq(users.id, stored.userId));
      }

      // Clean up used code
      verificationCodes.delete(phone);

      return NextResponse.json({
        success: true,
        message: 'Phone number verified',
        userId: stored.userId,
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use "send" or "verify".' }, { status: 400 });

  } catch (error) {
    console.error('[verify-phone] Error:', error);
    return NextResponse.json({
      error: 'Verification failed'
    }, { status: 500 });
  }
}
