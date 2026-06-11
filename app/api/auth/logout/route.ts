import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { authSessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const sessionToken = jar.get(SESSION_COOKIE)?.value;

    if (sessionToken) {
      // Delete session from database
      await db
        .delete(authSessions)
        .where(eq(authSessions.token, sessionToken));
    }

    // Clear cookie
    jar.delete(SESSION_COOKIE);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[auth/logout] Error:', error);
    return NextResponse.json({
      error: 'Logout failed'
    }, { status: 500 });
  }
}
