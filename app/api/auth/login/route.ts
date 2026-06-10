import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { ensureSchema } from '@/lib/db/migrate';

export async function POST(req: NextRequest) {
  try {
    // Ensure database schema exists
    await ensureSchema();

    const body = await req.json();
    const { email, password } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    // Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // For demo/beta: auto-create user
      const [newUser] = await db
        .insert(users)
        .values({
          email,
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
        }
      });
    }

    // TODO: Add password verification when passwords are implemented
    // For now: just create session
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
      error: 'Login failed'
    }, { status: 500 });
  }
}
