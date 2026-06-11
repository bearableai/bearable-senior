/**
 * Tiered Escalation System
 *
 * Three notification tiers:
 * - informational: weekly summary (Sundays) — "Mom had 2 rough days this week but bounced back"
 * - advisory: fires when pattern is declining 4+ days but not yet urgent
 * - urgent: existing behavior (immediate heads-up with multi-agent consensus)
 *
 * Caretakers choose their notification_level:
 * - 'all': receives informational + advisory + urgent
 * - 'advisory_and_urgent': receives advisory + urgent (default)
 * - 'urgent_only': receives only urgent updates
 */

export type NotificationTier = 'informational' | 'advisory' | 'urgent';
export type NotificationLevel = 'all' | 'advisory_and_urgent' | 'urgent_only';

/**
 * Determines whether a notification should be sent based on the
 * caretaker's chosen notification level.
 */
export function shouldSendNotification(
  tier: NotificationTier,
  caretakerLevel: NotificationLevel
): boolean {
  switch (caretakerLevel) {
    case 'all':
      return true;
    case 'advisory_and_urgent':
      return tier === 'advisory' || tier === 'urgent';
    case 'urgent_only':
      return tier === 'urgent';
    default:
      return tier === 'urgent'; // Fail safe: always allow urgent
  }
}

/**
 * Analyzes recent check-ins and determines the appropriate escalation tier.
 * Returns null if no escalation is needed.
 */
export function determineEscalationTier(
  checkIns: Array<{ feelingOk: boolean; createdAt: Date }>
): NotificationTier | null {
  if (checkIns.length === 0) return null;

  // Sort by most recent first
  const sorted = [...checkIns].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  // Count consecutive bad days from most recent
  let consecutiveBadDays = 0;
  for (const checkIn of sorted) {
    if (!checkIn.feelingOk) {
      consecutiveBadDays++;
    } else {
      break;
    }
  }

  // Urgent: 3+ consecutive bad check-ins (existing behavior)
  if (consecutiveBadDays >= 3) {
    return 'urgent';
  }

  // Advisory: pattern declining for 4+ days (more than half are bad in last 7)
  const last7 = sorted.slice(0, 7);
  const badInLast7 = last7.filter((c) => !c.feelingOk).length;

  if (last7.length >= 4 && badInLast7 >= 4) {
    return 'advisory';
  }

  return null;
}

/**
 * Generates an advisory message based on declining pattern.
 */
export function generateAdvisoryMessage(
  seniorName: string,
  badDayCount: number
): string {
  return `[Bearable Update] ${seniorName} has had ${badDayCount} tough days recently — nothing urgent, but worth keeping in touch.`;
}

/**
 * Generates a weekly informational summary message.
 */
export function generateWeeklySummary(
  seniorName: string,
  totalCheckIns: number,
  goodDays: number,
  badDays: number
): string {
  if (badDays === 0) {
    return `[Bearable Weekly] ${seniorName} had a great week — ${goodDays} good check-ins and no rough days.`;
  }

  if (goodDays > badDays) {
    return `[Bearable Weekly] ${seniorName} had ${badDays} rough day${badDays > 1 ? 's' : ''} this week but bounced back. ${goodDays}/${totalCheckIns} check-ins were positive.`;
  }

  return `[Bearable Weekly] ${seniorName} had a tough week — ${badDays} rough days out of ${totalCheckIns} check-ins. They might appreciate a call.`;
}
