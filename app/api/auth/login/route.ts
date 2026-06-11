import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { ensureSchema } from '@/lib/db/migrate';
import bcrypt from 'bcrypt';
import { checkRateLimit, getClientIp, getRateLimitHeaders } from '@/lib/rate-limit';

const SALT_ROUNDS = 10;

export async function POST(req: NextRequest) {
  try {
    // Rate limiting by IP: 10 login attempts per 15 minutes
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(`auth-login:${clientIp}`, {
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: getRateLimitHeaders(rateLimit),
        }
      );
    }

    // Ensure database schema exists
    await ensureSchema();

    const body = await req.json();
    const { email, password, action, phone, phoneVerified } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    // Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // SIGNUP: Create new user
    if (action === 'signup') {
      if (user) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
      }

      // Require phone verification for signup (security requirement)
      if (!phone || !phoneVerified) {
        return NextResponse.json({ error: 'Phone verification required for signup' }, { status: 400 });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          phone, // Only set if verified
          fullName: email.split('@')[0],
          userType: 'senior',
        })
        .returning();

      const sessionToken = await createSession(newUser.id);
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
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          userType: newUser.userType,
          phone: newUser.phone,
        }
      });
    }

    // LOGIN: Verify existing user
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: 'Account has no password set' }, { status: 401 });
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const sessionToken = await createSession(user.id);
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
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        userType: user.userType,
      }
    });

  } catch (error) {
    console.error('[auth/login] Error:', error);
    return NextResponse.json({
      error: 'Authentication failed'
    }, { status: 500 });
  }
}
