import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { invites, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionUserId } from '@/lib/auth/session';
import { sendSMS } from '@/lib/sms/twilio';
import { normalizePhone } from '@/lib/sms/twilio';
import { randomBytes } from 'crypto';

const INVITE_TTL_DAYS = 7;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bearable-senior.vercel.app';

/**
 * POST /api/caretaker/invite
 * Creates an invite for a caretaker and sends them an SMS with a signup link.
 * Called by a senior who wants to invite a caretaker.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { phone, label } = body;

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
    }

    // Get the senior's info for the invite message
    const [senior] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!senior) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate a unique invite token
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

    // Create invite record (use phone as email field for compatibility with existing schema)
    const [invite] = await db
      .insert(invites)
      .values({
        seniorId: userId,
        email: normalizedPhone, // Store phone in email field for now
        label: label || null,
        token,
        status: 'pending',
        expiresAt,
      })
      .returning();

    // Send SMS with signup link
    const seniorName = senior.fullName || 'Your family member';
    const signupLink = `${APP_URL}/invite/${token}`;
    const message = `${seniorName} invited you to Bearable. Sign up here: ${signupLink}`;

    try {
      await sendSMS(normalizedPhone, message);
    } catch (err) {
      console.error('[caretaker/invite] Failed to send invite SMS:', err);
      // Still return success - invite is created even if SMS fails
    }

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        token: invite.token,
        expiresAt: invite.expiresAt,
        phone: normalizedPhone,
      },
    });
  } catch (error) {
    console.error('[caretaker/invite] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create invite' },
      { status: 500 }
    );
  }
}
