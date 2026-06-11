import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendSMS, generateVerifyCode } from '@/lib/sms/twilio';

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
    const body = await req.json();
    const { phone, code, action, userId } = body;

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    // ACTION: send - Send verification code
    if (action === 'send') {
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
