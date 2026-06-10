import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { relationships, users, checkIns } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all seniors this caretaker is connected to
    const seniorRelationships = await db
      .select()
      .from(relationships)
      .innerJoin(users, eq(relationships.seniorId, users.id))
      .where(eq(relationships.caretakerId, userId));

    const seniors = await Promise.all(
      seniorRelationships.map(async (rel) => {
        const seniorId = rel.relationships.seniorId;

        // Get last 3 check-ins
        const recentCheckIns = await db
          .select()
          .from(checkIns)
          .where(eq(checkIns.userId, seniorId))
          .orderBy(desc(checkIns.createdAt))
          .limit(3);

        return {
          id: rel.users.id,
          fullName: rel.users.fullName,
          email: rel.users.email,
          phone: rel.users.phone,
          label: rel.relationships.label,
          relationshipStatus: rel.relationships.status,
          recentCheckIns: recentCheckIns.map(c => ({
            id: c.id,
            feelingOk: c.feelingOk,
            createdAt: c.createdAt,
            caretakerNotified: c.caretakerNotified,
          })),
        };
      })
    );

    return NextResponse.json({ seniors });

  } catch (error) {
    console.error('[caretaker/seniors] Error:', error);
    return NextResponse.json({
      error: 'Failed to fetch seniors'
    }, { status: 500 });
  }
}
