import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { invites, users, relationships } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * POST /api/invite/accept
 * Accepts an invite token, creates the caretaker user if needed,
 * and establishes the caretaker<->senior relationship.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, email, password, fullName, phone } = body;

    if (!token) {
      return NextResponse.json({ error: 'Invite token is required' }, { status: 400 });
    }

    // Look up the invite
    const [invite] = await db
      .select()
      .from(invites)
      .where(eq(invites.token, token))
      .limit(1);

    if (!invite) {
      return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
    }

    // Check if already accepted
    if (invite.status === 'accepted') {
      return NextResponse.json({ error: 'This invite has already been accepted' }, { status: 400 });
    }

    // Check if expired
    if (new Date() > invite.expiresAt) {
      // Mark as expired
      await db
        .update(invites)
        .set({ status: 'expired' })
        .where(eq(invites.id, invite.id));

      return NextResponse.json({ error: 'This invite has expired' }, { status: 410 });
    }

    // Require email and password for new account creation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required to accept an invite' },
        { status: 400 }
      );
    }

    // Check if user already exists with this email
    let [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let caretakerId: string;

    if (existingUser) {
      // User exists — just use their account
      caretakerId = existingUser.id;

      // Update to caretaker type if they were a senior (edge case)
      if (existingUser.userType === 'senior') {
        await db
          .update(users)
          .set({ userType: 'caretaker' })
          .where(eq(users.id, existingUser.id));
      }
    } else {
      // Create new caretaker user
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const [newUser] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          fullName: fullName || email.split('@')[0],
          phone: phone || invite.email, // invite.email stores the invited phone
          userType: 'caretaker',
        })
        .returning();

      caretakerId = newUser.id;
    }

    // Check if relationship already exists
    const [existingRelationship] = await db
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.seniorId, invite.seniorId),
          eq(relationships.caretakerId, caretakerId)
        )
      )
      .limit(1);

    if (!existingRelationship) {
      // Create the caretaker<->senior relationship
      await db.insert(relationships).values({
        seniorId: invite.seniorId,
        caretakerId,
        label: invite.label,
        status: 'active',
      });
    }

    // Mark invite as accepted
    await db
      .update(invites)
      .set({ status: 'accepted' })
      .where(eq(invites.id, invite.id));

    // Create session for the new/existing caretaker
    const sessionToken = await createSession(caretakerId);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return NextResponse.json({
      success: true,
      userId: caretakerId,
      seniorId: invite.seniorId,
      relationship: existingRelationship ? 'existing' : 'created',
    });
  } catch (error) {
    console.error('[invite/accept] Error:', error);
    return NextResponse.json(
      { error: 'Failed to accept invite' },
      { status: 500 }
    );
  }
}
