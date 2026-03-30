/**
 * Adaptive Workflow Composer
 *
 * Dynamically composes workflows from reusable operators instead of
 * selecting from static templates. Inspired by:
 *
 * - AFlow (ICLR 2025 Oral): MCTS-based workflow search with reusable operators
 * - DAAO (WWW 2026): query-specific workflow generation
 * - ADaPT (NAACL 2024): recursive decomposition only when needed
 *
 * Operators are composable building blocks:
 * - Analyze: gather context and understand the task
 * - Generate: produce code, text, or artifacts
 * - Review: validate quality of outputs
 * - Delegate: send to a specific AI
 * - Ensemble: run multiple AIs in parallel on the same task
 * - Cascade: try cheaper AI first, escalate on failure
 * - Verify: self-check output quality before proceeding
 */

import { WorkflowDefinition, WorkflowPhase } from './workflow-engine.js';
import { estimateTaskDifficulty, analyzeTaskForRouting, buildCascadePlan, type TaskDifficulty } from './semantic-router.js';
import type { WorkflowLevel } from './session-manager.js';

// ============================================
// Operators
// ============================================

export type OperatorType = 'analyze' | 'generate' | 'review' | 'delegate' | 'ensemble' | 'cascade' | 'verify';

export interface WorkflowOperator {
  type: OperatorType;
  name: string;
  description: string;
  /** Which AI(s) to use */
  ai: string | string[];
  /** Cost weight (1=cheap, 5=expensive) */
  costWeight: number;
  /** Quality weight (1=low, 5=high) */
  qualityWeight: number;
}

/** Reusable operator library */
const OPERATORS: Record<string, WorkflowOperator> = {
  'claude-analyze': {
    type: 'analyze',
    name: 'Claude Context Analysis',
    description: 'Claude analyzes task and gathers context',
    ai: 'claude',
    costWeight: 3,
    qualityWeight: 5,
  },
  'codex-analyze': {
    type: 'analyze',
    name: 'Codex Code Analysis',
    description: 'Codex performs deep code analysis',
    ai: 'codex',
    costWeight: 2,
    qualityWeight: 4,
  },
  'gemini-analyze': {
    type: 'analyze',
    name: 'Gemini Multimodal Analysis',
    description: 'Gemini analyzes UI/visual/documentation aspects',
    ai: 'gemini',
    costWeight: 1,
    qualityWeight: 3,
  },
  'claude-generate': {
    type: 'generate',
    name: 'Claude Implementation',
    description: 'Claude generates implementation',
    ai: 'claude',
    costWeight: 4,
    qualityWeight: 5,
  },
  'codex-generate': {
    type: 'generate',
    name: 'Codex Implementation',
    description: 'Codex generates implementation',
    ai: 'codex',
    costWeight: 2,
    qualityWeight: 4,
  },
  'claude-review': {
    type: 'review',
    name: 'Claude Review',
    description: 'Claude reviews output for quality and security',
    ai: 'claude',
    costWeight: 3,
    qualityWeight: 5,
  },
  'parallel-analysis': {
    type: 'ensemble',
    name: 'Parallel Multi-AI Analysis',
    description: 'Codex + Gemini analyze in parallel, then synthesize',
    ai: ['codex', 'gemini'],
    costWeight: 3,
    qualityWeight: 4,
  },
  'cascade-execute': {
    type: 'cascade',
    name: 'Cascade Execution',
    description: 'Try cheapest AI first, escalate on failure',
    ai: ['gemini', 'codex', 'claude'],
    costWeight: 2,
    qualityWeight: 4,
  },
  'self-verify': {
    type: 'verify',
    name: 'Self-Verification',
    description: 'Agent self-checks its output quality',
    ai: 'claude',
    costWeight: 1,
    qualityWeight: 3,
  },
};

// ============================================
// Composition Rules
// ============================================

interface CompositionRule {
  difficulty: TaskDifficulty;
  /** Operators to include, in order */
  operators: string[];
  /** Parallel execution config */
  parallel: boolean;
  level: WorkflowLevel;
}

/**
 * Composition rules map difficulty to operator sequences.
 * These are the "learned" patterns — in a full implementation,
 * MCTS or RL would discover these automatically.
 */
const COMPOSITION_RULES: CompositionRule[] = [
  {
    difficulty: 'simple',
    operators: ['claude-generate'],
    parallel: false,
    level: 'lite',
  },
  {
    difficulty: 'medium',
    operators: ['claude-analyze', 'codex-generate', 'claude-review'],
    parallel: false,
    level: 'plan',
  },
  {
    difficulty: 'complex',
    operators: ['claude-analyze', 'parallel-analysis', 'codex-generate', 'claude-review', 'self-verify'],
    parallel: true,
    level: 'collaborate',
  },
];

// ============================================
// Composer
// ============================================

/**
 * Compose a workflow dynamically based on task characteristics.
 * Returns a WorkflowDefinition that the existing engine can execute.
 */
export function composeWorkflow(task: string): WorkflowDefinition {
  const difficulty = estimateTaskDifficulty(task);
  const routing = analyzeTaskForRouting(task);

  // Find matching composition rule
  const rule = COMPOSITION_RULES.find(r => r.difficulty === difficulty.difficulty)
    || COMPOSITION_RULES[1]; // default to medium

  // Build phases from operators
  const phases: WorkflowPhase[] = [];
  let phaseIndex = 0;
  let previousOutputs: string[] = ['task'];

  for (const opName of rule.operators) {
    const op = OPERATORS[opName];
    if (!op) continue;

    phaseIndex++;
    const phaseId = `composed-${phaseIndex}`;
    const outputs = [`${phaseId}-output`];

    if (op.type === 'ensemble') {
      // Ensemble: create parallel phases for each AI
      const ais = Array.isArray(op.ai) ? op.ai : [op.ai];
      const ensembleOutputs: string[] = [];

      for (const ai of ais) {
        const subId = `${phaseId}-${ai}`;
        ensembleOutputs.push(`${subId}-output`);
        phases.push({
          id: subId,
          name: `${op.name} (${ai})`,
          type: 'delegation',
          assignedAI: ai as any,
          inputs: [...previousOutputs],
          outputs: [`${subId}-output`],
        });
      }

      // Add synthesis phase
      phases.push({
        id: `${phaseId}-synthesize`,
        name: 'Synthesize Ensemble',
        type: 'planning',
        assignedAI: 'claude',
        inputs: ensembleOutputs,
        outputs,
        config: { moaMode: true },
      });

      previousOutputs = outputs;
    } else {
      const phaseType = op.type === 'analyze' ? 'planning'
        : op.type === 'review' || op.type === 'verify' ? 'review'
        : op.type === 'delegate' || op.type === 'cascade' ? 'delegation'
        : 'execution';

      const assignedAI = Array.isArray(op.ai) ? op.ai[0] : op.ai;

      phases.push({
        id: phaseId,
        name: op.name,
        type: phaseType,
        assignedAI: assignedAI as any,
        inputs: [...previousOutputs],
        outputs,
        config: op.type === 'verify' ? {
          prompt: `Self-verify: Check your previous output for correctness, completeness, and quality. If issues are found, provide corrections.`,
        } : undefined,
      });

      previousOutputs = outputs;
    }
  }

  return {
    name: `adaptive-${difficulty.difficulty}`,
    level: rule.level,
    description: `Adaptively composed workflow for ${difficulty.difficulty} task (${rule.operators.length} operators)`,
    phases,
    parallelConfig: rule.parallel ? {
      maxConcurrency: 2,
      dependencyAware: true,
    } : undefined,
  };
}

/**
 * Get available operators for introspection
 */
export function getAvailableOperators(): WorkflowOperator[] {
  return Object.values(OPERATORS);
}
