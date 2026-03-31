/**
 * Semantic Router v2
 *
 * Weighted keyword scoring with confidence thresholds, cost-awareness,
 * and cascading strategy. Replaces the v1 bag-of-keywords classifier.
 *
 * Key improvements over v1:
 * - Weighted keywords (high/medium/low specificity)
 * - Confidence threshold with fallback to Claude
 * - Cost-aware cascading: try cheaper model first, escalate if needed
 * - Category-level scoring prevents single-keyword false positives
 * - Returns ranked list instead of single pick
 */

// ============================================
// Types
// ============================================

export interface RoutingResult {
  /** Best AI for this task */
  ai: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Keywords that matched */
  reasons: string[];
  /** Full ranked list of AIs with scores */
  ranking: AIScore[];
  /** Whether cascading is recommended */
  cascadeRecommended: boolean;
}

export interface AIScore {
  ai: string;
  score: number;
  normalizedScore: number;
  matchedKeywords: string[];
  cost: CostTier;
}

export type CostTier = 'free' | 'low' | 'medium' | 'high';

interface WeightedKeyword {
  pattern: RegExp;
  weight: number;
  label: string;
}

interface AIProfile {
  keywords: WeightedKeyword[];
  strengths: string[];
  cost: CostTier;
  /** Order in cascade chain (lower = try first) */
  cascadeOrder: number;
}

// ============================================
// AI Profiles with Weighted Keywords
// ============================================

const COST_MULTIPLIER: Record<CostTier, number> = {
  free: 1.0,
  low: 0.95,
  medium: 0.85,
  high: 0.75,
};

/**
 * Confidence threshold below which we default to Claude.
 * If the best AI has confidence below this, routing is ambiguous.
 */
const MIN_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Minimum raw score to consider routing to a non-default AI.
 * Prevents single low-weight keyword matches from triggering routing.
 */
const MIN_RAW_SCORE_THRESHOLD = 2.0;

/** AI routing profiles with weighted keywords */
export const AI_PROFILES: Record<string, AIProfile> = {
  codex: {
    keywords: [
      // High-weight: strong signals unique to Codex
      { pattern: /\b(algorithm|optimize|performance|benchmark|profile)\b/i, weight: 3, label: 'performance' },
      { pattern: /\b(backend|server|api|endpoint|database|sql|migration)\b/i, weight: 3, label: 'backend' },
      { pattern: /\b(debug|debugger|breakpoint|stack\s?trace|core\s?dump)\b/i, weight: 3, label: 'debugging' },
      { pattern: /\b(shell|terminal|cli|bash|command[- ]line)\b/i, weight: 2.5, label: 'cli' },

      // Medium-weight: common but somewhat specific
      { pattern: /\b(python|node|javascript|typescript|go|rust|java|c\+\+|ruby)\b/i, weight: 2, label: 'language' },
      { pattern: /\b(implement|refactor|fix|patch|hotfix)\b/i, weight: 1.5, label: 'implementation' },
      { pattern: /\b(test|spec|unittest|pytest|jest|mocha)\b/i, weight: 2, label: 'testing' },
      { pattern: /\b(lint|format|eslint|prettier|mypy|type[- ]check)\b/i, weight: 2, label: 'quality' },

      // Low-weight: general coding signals
      { pattern: /\b(code|function|class|module|package)\b/i, weight: 0.5, label: 'code-general' },
      { pattern: /\b(analyze|review)\b/i, weight: 1, label: 'review' },
    ],
    strengths: ['algorithm', 'backend', 'performance', 'debugging', 'code execution'],
    cost: 'low',
    cascadeOrder: 1,
  },

  gemini: {
    keywords: [
      // High-weight: strong signals unique to Gemini
      { pattern: /\b(frontend|ui|ux|user\s?interface|user\s?experience)\b/i, weight: 3, label: 'frontend' },
      { pattern: /\b(visual|multimodal|image|diagram|sketch|screenshot|mockup)\b/i, weight: 3, label: 'visual' },
      { pattern: /\b(css|html|react|vue|angular|svelte|tailwind|sass|scss)\b/i, weight: 2.5, label: 'web-frontend' },
      { pattern: /\b(design|layout|responsive|animation|transition)\b/i, weight: 2, label: 'design' },

      // Medium-weight
      { pattern: /\b(explain|summarize|document|translate|describe)\b/i, weight: 1.5, label: 'explanation' },
      { pattern: /\b(research|compare|survey|overview|literature)\b/i, weight: 2, label: 'research' },
      { pattern: /\b(accessibility|a11y|aria|wcag)\b/i, weight: 2.5, label: 'accessibility' },

      // Low-weight
      { pattern: /\b(write|create|generate)\b/i, weight: 0.5, label: 'creation' },
      { pattern: /\b(color|font|icon|component)\b/i, weight: 1, label: 'ui-element' },
    ],
    strengths: ['frontend', 'UI/UX', 'visual analysis', 'documentation', 'research'],
    cost: 'free',
    cascadeOrder: 0,
  },

  claude: {
    keywords: [
      // High-weight: strong signals unique to Claude
      { pattern: /\b(plan|architect|design\s?system|strategy|roadmap)\b/i, weight: 3, label: 'planning' },
      { pattern: /\b(security|audit|compliance|vulnerability|pentest|cve)\b/i, weight: 3, label: 'security' },
      { pattern: /\b(complex|multi[- ]step|orchestrat|coordinat|integrat)\b/i, weight: 2.5, label: 'orchestration' },
      { pattern: /\b(refactor.*large|migrate|rewrite|overhaul)\b/i, weight: 3, label: 'large-refactor' },

      // Medium-weight
      { pattern: /\b(review|assess|evaluate|critique)\b/i, weight: 1.5, label: 'review' },
      { pattern: /\b(architecture|system\s?design|trade[- ]off)\b/i, weight: 2, label: 'architecture' },
      { pattern: /\b(prompt|llm|ai|model|fine[- ]tun)\b/i, weight: 2, label: 'ai-related' },
    ],
    strengths: ['planning', 'architecture', 'security', 'integration', 'complex reasoning'],
    cost: 'high',
    cascadeOrder: 2,
  },
};

// Legacy export for backward compatibility
export const AI_ROUTING_PATTERNS: Record<string, { keywords: RegExp[]; strength: string[] }> = Object.fromEntries(
  Object.entries(AI_PROFILES).map(([ai, profile]) => [
    ai,
    {
      keywords: profile.keywords.map(k => k.pattern),
      strength: profile.strengths,
    },
  ])
);

// ============================================
// Core Routing Logic
// ============================================

/**
 * Score a task against all AI profiles using weighted keyword matching.
 */
function scoreTask(task: string): AIScore[] {
  const scores: AIScore[] = [];

  for (const [ai, profile] of Object.entries(AI_PROFILES)) {
    let totalScore = 0;
    const matchedKeywords: string[] = [];

    for (const kw of profile.keywords) {
      const match = task.match(kw.pattern);
      if (match) {
        totalScore += kw.weight;
        matchedKeywords.push(`${kw.label}(${match[0]})`);
      }
    }

    scores.push({
      ai,
      score: totalScore,
      normalizedScore: 0, // computed below
      matchedKeywords,
      cost: profile.cost,
    });
  }

  // Normalize scores
  const maxScore = Math.max(...scores.map(s => s.score), 1);
  for (const s of scores) {
    s.normalizedScore = s.score / maxScore;
  }

  // Sort by score descending, break ties by cost (cheaper first)
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return AI_PROFILES[a.ai].cascadeOrder - AI_PROFILES[b.ai].cascadeOrder;
  });

  return scores;
}

/**
 * Analyze task and determine best AI using weighted semantic routing.
 *
 * Improvements over v1:
 * - Weighted keywords prevent single-match false positives
 * - Confidence threshold defaults ambiguous tasks to Claude
 * - Returns full ranking for cascade strategy
 */
export function analyzeTaskForRouting(task: string): RoutingResult {
  const ranking = scoreTask(task);
  const best = ranking[0];
  const totalScore = ranking.reduce((sum, s) => sum + s.score, 0);

  // Confidence: proportion of score held by the winner
  const confidence = totalScore > 0 ? best.score / totalScore : 0;

  // If confidence is too low or raw score too low, default to Claude
  const isAmbiguous = confidence < MIN_CONFIDENCE_THRESHOLD || best.score < MIN_RAW_SCORE_THRESHOLD;
  const selectedAI = isAmbiguous ? 'claude' : best.ai;

  // Recommend cascading when the top two AIs are close in score
  const second = ranking[1];
  const scoreDelta = second ? (best.score - second.score) / Math.max(best.score, 1) : 1;
  const cascadeRecommended = scoreDelta < 0.3 && !isAmbiguous;

  return {
    ai: selectedAI,
    confidence: isAmbiguous ? 0.5 : Math.min(confidence, 1),
    reasons: isAmbiguous ? ['ambiguous-task'] : best.matchedKeywords,
    ranking,
    cascadeRecommended,
  };
}

// ============================================
// Cascading Strategy
// ============================================

export interface CascadeStep {
  ai: string;
  cost: CostTier;
  reason: string;
}

/**
 * Generate a cascade plan: ordered list of AIs to try.
 * Try cheaper models first; escalate to more capable (expensive) models
 * only if the output quality is insufficient.
 *
 * Inspired by RouteLLM / FrugalGPT / AutoMix research.
 */
export function buildCascadePlan(task: string): CascadeStep[] {
  const routing = analyzeTaskForRouting(task);
  const steps: CascadeStep[] = [];

  // Sort eligible AIs by cascade order (cheapest first)
  const eligible = routing.ranking
    .filter(s => s.score > 0)
    .sort((a, b) => AI_PROFILES[a.ai].cascadeOrder - AI_PROFILES[b.ai].cascadeOrder);

  if (eligible.length === 0) {
    // No matches — just use Claude
    return [{ ai: 'claude', cost: 'high', reason: 'default (no keyword matches)' }];
  }

  for (const entry of eligible) {
    steps.push({
      ai: entry.ai,
      cost: entry.cost,
      reason: entry.matchedKeywords.join(', ') || 'cascade fallback',
    });
  }

  // Always ensure Claude is the final escalation target
  if (!steps.some(s => s.ai === 'claude')) {
    steps.push({ ai: 'claude', cost: 'high', reason: 'final escalation' });
  }

  return steps;
}

// ============================================
// Difficulty Estimation (for auto-mode)
// ============================================

export type TaskDifficulty = 'simple' | 'medium' | 'complex';

export interface DifficultyEstimate {
  difficulty: TaskDifficulty;
  score: number;
  signals: string[];
  recommendedWorkflow: string;
}

/**
 * Estimate task difficulty using heuristics.
 * Used by auto-mode to select the appropriate workflow level.
 *
 * Inspired by DAAO (WWW 2026) difficulty-aware orchestration
 * and the 45% Threshold Rule (arXiv 2512.08296).
 */
export function estimateTaskDifficulty(task: string): DifficultyEstimate {
  let score = 0;
  const signals: string[] = [];

  // Signal 1: Task length (longer = more complex)
  const wordCount = task.split(/\s+/).length;
  if (wordCount > 100) {
    score += 3;
    signals.push(`long-description(${wordCount}w)`);
  } else if (wordCount > 40) {
    score += 1.5;
    signals.push(`medium-description(${wordCount}w)`);
  }

  // Signal 2: Multiple file/component references
  const fileRefs = (task.match(/\b[\w/-]+\.\w{1,5}\b/g) || []).length;
  if (fileRefs >= 3) {
    score += 2;
    signals.push(`multi-file(${fileRefs})`);
  }

  // Signal 3: Complexity keywords
  const complexityPatterns: Array<{ pattern: RegExp; weight: number; label: string }> = [
    { pattern: /\b(redesign|overhaul|rewrite|migrate|re-?architect)\b/i, weight: 3, label: 'major-change' },
    { pattern: /\b(multi[- ]step|end[- ]to[- ]end|full[- ]stack|cross[- ]cutting)\b/i, weight: 2.5, label: 'cross-cutting' },
    { pattern: /\b(security|auth\w*|payment|encryption|compliance)\b/i, weight: 2, label: 'sensitive-domain' },
    { pattern: /\b(parallel|concurrent|distributed|async)\b/i, weight: 1.5, label: 'concurrency' },
    { pattern: /\b(and|also|plus|additionally|as well as)\b/i, weight: 0.5, label: 'multi-requirement' },
  ];

  for (const cp of complexityPatterns) {
    if (cp.pattern.test(task)) {
      score += cp.weight;
      signals.push(cp.label);
    }
  }

  // Signal 4: Simplicity keywords (reduce score)
  const simplicityPatterns: Array<{ pattern: RegExp; weight: number; label: string }> = [
    { pattern: /\b(fix\s+typo|rename|update\s+version|bump)\b/i, weight: -3, label: 'trivial-fix' },
    { pattern: /\b(simple|quick|small|minor|tiny)\b/i, weight: -2, label: 'explicitly-simple' },
    { pattern: /\b(add\s+comment|add\s+log|update\s+readme)\b/i, weight: -2, label: 'doc-only' },
  ];

  for (const sp of simplicityPatterns) {
    if (sp.pattern.test(task)) {
      score += sp.weight;
      signals.push(sp.label);
    }
  }

  // Clamp score
  score = Math.max(0, score);

  // Map score to difficulty
  let difficulty: TaskDifficulty;
  let recommendedWorkflow: string;

  if (score <= 2) {
    difficulty = 'simple';
    recommendedWorkflow = 'lite';
  } else if (score <= 5) {
    difficulty = 'medium';
    recommendedWorkflow = 'plan';
  } else {
    difficulty = 'complex';
    recommendedWorkflow = 'five-phase';
  }

  return { difficulty, score, signals, recommendedWorkflow };
}
