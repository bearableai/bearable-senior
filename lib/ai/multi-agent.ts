// Multi-agent consensus framework
// Cross-agent validation for safety-critical decisions

export interface AgentResult<T = any> {
  agentName: string;
  decision: boolean;
  confidence: number; // 0-1
  reasoning: string;
  data?: T;
  duration: number; // milliseconds
}

export interface ConsensusResult<T = any> {
  consensus: boolean;
  confidence: number; // 0-1
  agentResults: AgentResult<T>[];
  convergence: number; // How many agents agreed (0-1)
  reasons: string[];
}

/**
 * Run multiple agents in parallel and check for consensus
 * @param agents - Array of agent functions to run
 * @param minAgreement - Minimum fraction of agents that must agree (default: 0.67 = 2/3)
 * @param timeout - Timeout per agent in milliseconds (default: 10000)
 */
export async function runMultiAgentConsensus<T = any>(
  agents: Array<{
    name: string;
    fn: () => Promise<{ decision: boolean; confidence: number; reasoning: string; data?: T }>;
  }>,
  minAgreement: number = 0.67,
  timeout: number = 10000,
): Promise<ConsensusResult<T>> {
  const results = await Promise.all(
    agents.map(async (agent): Promise<AgentResult<T>> => {
      const startTime = Date.now();

      try {
        // Run agent with timeout
        const result = await Promise.race([
          agent.fn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Agent timeout')), timeout)
          ),
        ]);

        return {
          agentName: agent.name,
          decision: result.decision,
          confidence: result.confidence,
          reasoning: result.reasoning,
          data: result.data,
          duration: Date.now() - startTime,
        };
      } catch (err) {
        // Agent failed - count as low-confidence negative
        return {
          agentName: agent.name,
          decision: false,
          confidence: 0,
          reasoning: `Agent failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          duration: Date.now() - startTime,
        };
      }
    })
  );

  // Calculate consensus
  const positiveDecisions = results.filter(r => r.decision).length;
  const convergence = positiveDecisions / results.length;
  const consensus = convergence >= minAgreement;

  // Weighted confidence (average of agreeing agents only)
  const agreeingAgents = results.filter(r => r.decision === consensus);
  const confidence = agreeingAgents.length > 0
    ? agreeingAgents.reduce((sum, r) => sum + r.confidence, 0) / agreeingAgents.length
    : 0;

  // Collect reasoning from agreeing agents
  const reasons = agreeingAgents
    .filter(r => r.reasoning)
    .map(r => `${r.agentName}: ${r.reasoning}`);

  return {
    consensus,
    confidence,
    agentResults: results,
    convergence,
    reasons,
  };
}

/**
 * Detect cross-agent flags (independent consensus)
 * Highlights when multiple agents independently identify the same concern
 */
export function detectCrossFlags<T>(
  results: AgentResult<T>[],
  similarityThreshold: number = 0.7,
): Array<{ keyword: string; agents: string[]; count: number }> {
  const keywords = new Map<string, string[]>();

  // Extract keywords from reasoning
  results.forEach(result => {
    if (!result.reasoning) return;

    const words = result.reasoning
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 4); // Only words > 4 chars

    words.forEach(word => {
      if (!keywords.has(word)) keywords.set(word, []);
      keywords.get(word)!.push(result.agentName);
    });
  });

  // Find keywords mentioned by multiple agents
  const crossFlags = Array.from(keywords.entries())
    .filter(([_, agents]) => agents.length >= 2)
    .map(([keyword, agents]) => ({
      keyword,
      agents: [...new Set(agents)], // Dedupe
      count: agents.length,
    }))
    .sort((a, b) => b.count - a.count);

  return crossFlags;
}

/**
 * Specialized: Health escalation decision (for Bearable Senior)
 * Run 4 independent agents to decide if caretaker should be alerted
 */
export async function healthEscalationConsensus(
  userId: string,
  checkIns: Array<{ feelingOk: boolean; createdAt: Date; voiceNoteText?: string | null }>,
): Promise<ConsensusResult> {
  const agents = [
    {
      name: 'Pattern Detection',
      fn: async () => {
        // Agent 1: Look for temporal patterns
        const recentBad = checkIns.slice(0, 3).filter(c => !c.feelingOk).length;
        const decision = recentBad >= 3;

        return {
          decision,
          confidence: recentBad / 3,
          reasoning: decision
            ? `${recentBad} concerning check-ins in last 3 days`
            : 'No concerning pattern detected',
        };
      },
    },
    {
      name: 'Trend Analysis',
      fn: async () => {
        // Agent 2: Analyze trend direction
        const last7Days = checkIns.slice(0, 7);
        const badDays = last7Days.filter(c => !c.feelingOk).length;
        const badRatio = badDays / last7Days.length;
        const decision = badRatio >= 0.5;

        return {
          decision,
          confidence: badRatio,
          reasoning: decision
            ? `${badDays} of last ${last7Days.length} days concerning (${(badRatio * 100).toFixed(0)}%)`
            : 'Trend is stable',
        };
      },
    },
    {
      name: 'Context Analysis',
      fn: async () => {
        // Agent 3: Check voice note sentiment
        const recentWithNotes = checkIns.filter(c => c.voiceNoteText);
        if (recentWithNotes.length === 0) {
          return {
            decision: false,
            confidence: 0.5,
            reasoning: 'No voice notes to analyze',
          };
        }

        // Simple keyword-based sentiment (in real impl, use Claude)
        const concernKeywords = ['pain', 'dizzy', 'confused', 'scared', 'help', 'bad', 'worse', 'sick'];
        const notesText = recentWithNotes.map(c => c.voiceNoteText?.toLowerCase() || '').join(' ');
        const concernCount = concernKeywords.filter(k => notesText.includes(k)).length;
        const decision = concernCount >= 2;

        return {
          decision,
          confidence: Math.min(concernCount / 3, 1),
          reasoning: decision
            ? `Voice notes contain ${concernCount} concern keywords`
            : 'Voice notes show no major concerns',
        };
      },
    },
    {
      name: 'Trend Analysis (14-day)',
      fn: async () => {
        // Agent 4: Statistical trend analysis over 14-day window
        // Uses the same check-in data to avoid extra DB calls
        const total = checkIns.length;
        if (total < 4) {
          return {
            decision: false,
            confidence: 0.3,
            reasoning: 'Insufficient data for trend analysis (need 4+ check-ins)',
          };
        }

        // Split into recent half and older half
        const midpoint = Math.floor(total / 2);
        const recentHalf = checkIns.slice(0, midpoint);
        const olderHalf = checkIns.slice(midpoint);

        const recentOkRate = recentHalf.filter(c => c.feelingOk).length / recentHalf.length;
        const olderOkRate = olderHalf.filter(c => c.feelingOk).length / olderHalf.length;

        // Flag if recent period is significantly worse
        const decline = olderOkRate - recentOkRate;
        const decision = decline >= 0.25; // 25%+ drop in ok-rate

        return {
          decision,
          confidence: Math.min(decline * 2, 1), // Scale: 50% drop = full confidence
          reasoning: decision
            ? `14-day trend declining: ok-rate dropped from ${Math.round(olderOkRate * 100)}% to ${Math.round(recentOkRate * 100)}%`
            : `Trend stable: ok-rate ${Math.round(recentOkRate * 100)}% (recent) vs ${Math.round(olderOkRate * 100)}% (prior)`,
        };
      },
    },
  ];

  return await runMultiAgentConsensus(agents, 0.67, 5000);
}

/**
 * Specialized: Medication interaction check (multi-source validation)
 */
export async function medicationInteractionConsensus(
  medications: Array<{ name: string; class?: string }>,
): Promise<ConsensusResult<{ interactions: string[] }>> {
  const agents = [
    {
      name: 'Drug-Drug Interaction',
      fn: async () => {
        // Agent 1: Check known drug-drug interactions
        // (Simplified - real impl would call external API)
        const warfarin = medications.find(m => m.name.toLowerCase().includes('warfarin'));
        const amiodarone = medications.find(m => m.name.toLowerCase().includes('amiodarone'));

        const decision = !!(warfarin && amiodarone);

        return {
          decision,
          confidence: decision ? 0.95 : 0.5,
          reasoning: decision
            ? 'Warfarin + Amiodarone: CYP2C9/3A4 interaction risk'
            : 'No major drug-drug interactions detected',
          data: { interactions: decision ? ['warfarin-amiodarone'] : [] },
        };
      },
    },
    {
      name: 'Drug Class Check',
      fn: async () => {
        // Agent 2: Check for same-class duplicates
        const classes = medications.map(m => m.class).filter(Boolean) as string[];
        const duplicateClasses = classes.filter((c, i) => classes.indexOf(c) !== i);
        const decision = duplicateClasses.length > 0;

        return {
          decision,
          confidence: decision ? 0.8 : 0.6,
          reasoning: decision
            ? `Duplicate drug classes: ${duplicateClasses.join(', ')}`
            : 'No duplicate drug classes',
          data: { interactions: duplicateClasses },
        };
      },
    },
    {
      name: 'Polypharmacy Risk',
      fn: async () => {
        // Agent 3: Check for polypharmacy risk
        const medCount = medications.length;
        const decision = medCount >= 5;

        return {
          decision,
          confidence: medCount >= 7 ? 0.9 : medCount >= 5 ? 0.7 : 0.3,
          reasoning: decision
            ? `Polypharmacy risk: ${medCount} medications (5+ increases fall risk)`
            : `${medCount} medications within safe range`,
          data: { interactions: decision ? ['polypharmacy'] : [] },
        };
      },
    },
  ];

  return await runMultiAgentConsensus(agents, 0.67, 8000);
}
