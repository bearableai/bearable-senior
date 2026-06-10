import { cookies } from 'next/headers';
import { db } from '@/lib/db/client';
import { authSessions, users } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';

export const SESSION_COOKIE = 'bearable_senior_session';
export const SESSION_TTL_DAYS = 30;

export async function createSession(userId: string, ttlDays = SESSION_TTL_DAYS): Promise<string> {
  const token     = randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  await db.insert(authSessions).values({ userId, token, expiresAt });
  return token;
}

export async function resolveSession(token: string): Promise<string | null> {
  const [session] = await db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.token, token), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  return session?.userId ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.token, token));
}

export async function getSessionUserId(): Promise<string | null> {
  if (process.env.SINGLE_USER_MODE === 'true') {
    return process.env.DEV_USER_ID ?? '00000000-0000-0000-0000-000000000001';
  }
  const jar   = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(token);
}

export async function ensureUserProfile(email: string, fullName?: string | null): Promise<string> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({ email, fullName: fullName ?? null, userType: 'senior' })
    .returning();
  return created.id;
}
