/**
 * Semantic Router
 *
 * AI routing patterns and task analysis for intelligent delegation.
 * Extracted from delegate.ts for reuse across the codebase.
 */

/** Keyword patterns for semantic routing (CCW's semantic CLI invocation) */
export const AI_ROUTING_PATTERNS: Record<string, { keywords: RegExp[]; strength: string[] }> = {
  codex: {
    keywords: [
      /\b(algorithm|backend|api|server|database|logic|optimize|performance|debug|test)\b/i,
      /\b(python|node|javascript|typescript|go|rust|java)\b/i,
      /\b(implement|refactor|fix|analyze|review)\b/i,
      /\bcli\b/i,
    ],
    strength: ['algorithm', 'backend', 'performance', 'debugging', 'code review'],
  },
  gemini: {
    keywords: [
      /\b(frontend|ui|ux|design|style|css|html|react|vue|angular)\b/i,
      /\b(visual|multimodal|image|diagram|sketch|prototype)\b/i,
      /\b(explain|summarize|document|translate)\b/i,
      /\bresearch\b/i,
    ],
    strength: ['frontend', 'UI/UX', 'visual analysis', 'documentation', 'research'],
  },
  claude: {
    keywords: [
      /\b(plan|architect|design|strategy|complex|multi-step)\b/i,
      /\b(security|audit|compliance)\b/i,
      /\b(integrate|coordinate|orchestrate)\b/i,
    ],
    strength: ['planning', 'architecture', 'security', 'integration'],
  },
};

export interface RoutingResult {
  ai: string;
  confidence: number;
  reasons: string[];
}

/**
 * Analyze task and determine best AI using semantic routing.
 * Implements CCW's semantic CLI invocation pattern.
 */
export function analyzeTaskForRouting(task: string): RoutingResult {
  const scores: Record<string, { score: number; matches: string[] }> = {
    codex: { score: 0, matches: [] },
    gemini: { score: 0, matches: [] },
    claude: { score: 0, matches: [] },
  };

  // Score each AI based on keyword matches
  for (const [ai, patterns] of Object.entries(AI_ROUTING_PATTERNS)) {
    for (const pattern of patterns.keywords) {
      const match = task.match(pattern);
      if (match) {
        scores[ai].score += 1;
        scores[ai].matches.push(match[0]);
      }
    }
  }

  // Find best match
  let bestAI = 'claude'; // Default to Claude for complex/ambiguous tasks
  let bestScore = 0;

  for (const [ai, { score }] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestAI = ai;
    }
  }

  // Calculate confidence (0-1)
  const totalScore = Object.values(scores).reduce((sum, { score }) => sum + score, 0);
  const confidence = totalScore > 0 ? bestScore / totalScore : 0.5;

  return {
    ai: bestAI,
    confidence,
    reasons: scores[bestAI].matches,
  };
}
