import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { medications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { deidentifyMedications } from '@/lib/privacy/deidentify';
import { medicationInteractionConsensus } from '@/lib/ai/multi-agent';

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const meds = await db
      .select()
      .from(medications)
      .where(eq(medications.userId, userId));

    return NextResponse.json({ medications: meds });

  } catch (error) {
    console.error('[medications] Error fetching:', error);
    return NextResponse.json({
      error: 'Failed to fetch medications'
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, simpleSchedule, notes } = body;

    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    }

    const [medication] = await db.insert(medications).values({
      userId,
      name,
      simpleSchedule: simpleSchedule || null,
      notes: notes || null,
      status: 'active',
    }).returning();

    // Run multi-agent medication interaction check (async)
    const allMeds = await db
      .select()
      .from(medications)
      .where(eq(medications.userId, userId));

    if (allMeds.length >= 2) {
      medicationInteractionConsensus(
        allMeds.map(m => ({ name: m.name, class: undefined }))
      ).then((result) => {
        if (result.consensus) {
          console.log(
            `[medications] Interaction detected for user ${userId}:`,
            result.reasons
          );
          // TODO: Create escalation record and notify caretaker
        }
      }).catch((err) => {
        console.error('[medications] Interaction check failed:', err);
      });
    }

    return NextResponse.json({ medication });

  } catch (error) {
    console.error('[medications] Error creating:', error);
    return NextResponse.json({
      error: 'Failed to create medication'
    }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, simpleSchedule, notes, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const [medication] = await db
      .update(medications)
      .set({
        name: name || undefined,
        simpleSchedule: simpleSchedule !== undefined ? simpleSchedule : undefined,
        notes: notes !== undefined ? notes : undefined,
        status: status || undefined,
      })
      .where(eq(medications.id, id))
      .returning();

    return NextResponse.json({ medication });

  } catch (error) {
    console.error('[medications] Error updating:', error);
    return NextResponse.json({
      error: 'Failed to update medication'
    }, { status: 500 });
  }
}
