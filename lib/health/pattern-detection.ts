/**
 * 14-Day Trend Detection
 *
 * Goes beyond the 3-consecutive-bad-day rule by analyzing:
 * - Weekly ok-rate comparison (this week vs prior week)
 * - Mood trend (rolling average direction)
 * - Medication adherence rate
 *
 * Returns a structured TrendReport with severity scoring.
 */

import { db } from '@/lib/db/client';
import { checkIns, medicationReminders } from '@/lib/db/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

export type TrendDirection = 'improving' | 'stable' | 'declining';
export type TrendSeverity = 'none' | 'advisory' | 'urgent';

export interface TrendReport {
  userId: string;
  period: { start: Date; end: Date };
  // Weekly comparison
  thisWeekOkRate: number; // 0-1
  priorWeekOkRate: number; // 0-1
  weekOverWeekChange: number; // negative = declining
  weeklyDropFlag: boolean; // true if dropped >25%
  // Mood trend
  moodTrend: TrendDirection;
  rollingAverage: number; // 0-1, where 1 = all good
  // Medication adherence
  medicationAdherenceRate: number; // 0-1
  // Overall severity
  severity: TrendSeverity;
  summary: string;
}

/**
 * Detect trends over the last 14 days for a given user.
 */
export async function detectTrends(userId: string): Promise<TrendReport> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Fetch last 14 days of check-ins
  const recentCheckIns = await db
    .select({
      feelingOk: checkIns.feelingOk,
      createdAt: checkIns.createdAt,
    })
    .from(checkIns)
    .where(
      and(
        eq(checkIns.userId, userId),
        gte(checkIns.createdAt, fourteenDaysAgo),
      )
    )
    .orderBy(desc(checkIns.createdAt));

  // Split into this week and prior week
  const thisWeek = recentCheckIns.filter(c => c.createdAt! >= sevenDaysAgo);
  const priorWeek = recentCheckIns.filter(c => c.createdAt! < sevenDaysAgo);

  // Calculate ok-rates
  const thisWeekOkRate = thisWeek.length > 0
    ? thisWeek.filter(c => c.feelingOk).length / thisWeek.length
    : 1; // No data defaults to "fine"
  const priorWeekOkRate = priorWeek.length > 0
    ? priorWeek.filter(c => c.feelingOk).length / priorWeek.length
    : 1;

  const weekOverWeekChange = thisWeekOkRate - priorWeekOkRate;
  const weeklyDropFlag = priorWeekOkRate > 0 && (weekOverWeekChange / priorWeekOkRate) < -0.25;

  // Calculate mood trend (3-day rolling average direction)
  const moodTrend = calculateMoodTrend(recentCheckIns);

  // Rolling average over all 14 days
  const rollingAverage = recentCheckIns.length > 0
    ? recentCheckIns.filter(c => c.feelingOk).length / recentCheckIns.length
    : 1;

  // Medication adherence (last 14 days)
  const medicationAdherenceRate = await calculateMedicationAdherence(userId, fourteenDaysAgo);

  // Determine severity
  const severity = determineSeverity({
    weeklyDropFlag,
    moodTrend,
    rollingAverage,
    medicationAdherenceRate,
    thisWeekOkRate,
  });

  // Generate human-readable summary
  const summary = generateSummary({
    moodTrend,
    weeklyDropFlag,
    thisWeekOkRate,
    priorWeekOkRate,
    medicationAdherenceRate,
    severity,
  });

  return {
    userId,
    period: { start: fourteenDaysAgo, end: now },
    thisWeekOkRate,
    priorWeekOkRate,
    weekOverWeekChange,
    weeklyDropFlag,
    moodTrend,
    rollingAverage,
    medicationAdherenceRate,
    severity,
    summary,
  };
}

/**
 * Calculate mood trend direction from check-in data.
 * Compares the first half vs second half of the period.
 */
function calculateMoodTrend(
  checkIns: Array<{ feelingOk: boolean; createdAt: Date | null }>
): TrendDirection {
  if (checkIns.length < 4) return 'stable';

  const midpoint = Math.floor(checkIns.length / 2);

  // Recent half (index 0 = most recent, so first half of array = recent)
  const recentHalf = checkIns.slice(0, midpoint);
  const olderHalf = checkIns.slice(midpoint);

  const recentOkRate = recentHalf.filter(c => c.feelingOk).length / recentHalf.length;
  const olderOkRate = olderHalf.filter(c => c.feelingOk).length / olderHalf.length;

  const diff = recentOkRate - olderOkRate;

  if (diff > 0.15) return 'improving';
  if (diff < -0.15) return 'declining';
  return 'stable';
}

/**
 * Calculate medication adherence rate over a period.
 */
async function calculateMedicationAdherence(
  userId: string,
  since: Date
): Promise<number> {
  const reminders = await db
    .select({
      takenAt: medicationReminders.takenAt,
      missed: medicationReminders.missed,
      reminderSentAt: medicationReminders.reminderSentAt,
    })
    .from(medicationReminders)
    .where(
      and(
        eq(medicationReminders.userId, userId),
        gte(medicationReminders.createdAt, since),
      )
    );

  // Only count reminders that were actually sent
  const sentReminders = reminders.filter(r => r.reminderSentAt !== null);
  if (sentReminders.length === 0) return 1; // No reminders = full adherence (not applicable)

  const taken = sentReminders.filter(r => r.takenAt !== null).length;
  return taken / sentReminders.length;
}

/**
 * Determine overall severity from individual signals.
 */
function determineSeverity(signals: {
  weeklyDropFlag: boolean;
  moodTrend: TrendDirection;
  rollingAverage: number;
  medicationAdherenceRate: number;
  thisWeekOkRate: number;
}): TrendSeverity {
  const { weeklyDropFlag, moodTrend, rollingAverage, medicationAdherenceRate, thisWeekOkRate } = signals;

  // Urgent: multiple strong signals
  const urgentSignals = [
    thisWeekOkRate < 0.3,
    moodTrend === 'declining' && rollingAverage < 0.4,
    medicationAdherenceRate < 0.3,
  ].filter(Boolean).length;

  if (urgentSignals >= 2) return 'urgent';

  // Advisory: at least one moderate signal
  const advisorySignals = [
    weeklyDropFlag,
    moodTrend === 'declining',
    thisWeekOkRate < 0.5,
    medicationAdherenceRate < 0.5,
  ].filter(Boolean).length;

  if (advisorySignals >= 2) return 'advisory';

  return 'none';
}

/**
 * Generate a human-readable summary of the trend analysis.
 */
function generateSummary(data: {
  moodTrend: TrendDirection;
  weeklyDropFlag: boolean;
  thisWeekOkRate: number;
  priorWeekOkRate: number;
  medicationAdherenceRate: number;
  severity: TrendSeverity;
}): string {
  const parts: string[] = [];

  if (data.moodTrend === 'declining') {
    parts.push('Mood has been trending down over the past two weeks');
  } else if (data.moodTrend === 'improving') {
    parts.push('Mood has been improving recently');
  }

  if (data.weeklyDropFlag) {
    const dropPct = Math.round((1 - data.thisWeekOkRate / data.priorWeekOkRate) * 100);
    parts.push(`weekly wellness dropped ${dropPct}% compared to last week`);
  }

  if (data.medicationAdherenceRate < 0.7) {
    const pct = Math.round(data.medicationAdherenceRate * 100);
    parts.push(`medication adherence is at ${pct}%`);
  }

  if (parts.length === 0) {
    return 'No concerning trends detected — everything looks steady.';
  }

  const joined = parts.join('; ');
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}
