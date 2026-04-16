/**
 * Execution Logger
 *
 * Logs all routing decisions, workflow executions, and outcomes
 * to a JSON-lines file for feedback loop and self-improvement.
 *
 * Inspired by:
 * - Self-Evolving AI Agents Survey (2025): interaction data for self-improvement
 * - HyperAgent (Meta, 2026): LLM-analyzed failure for targeted retries
 * - Generator-Verifier-Updater pattern: review agent feedback propagation
 *
 * Design decisions:
 * - JSON-lines format (not SQLite) for simplicity and portability
 * - Append-only to avoid corruption from concurrent writes
 * - Auto-rotates when log exceeds MAX_LOG_SIZE
 */

import { existsSync, mkdirSync, appendFileSync, statSync, renameSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============================================
// Types
// ============================================

export interface ExecutionLogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Log entry type */
  type: 'routing' | 'workflow' | 'phase' | 'cascade';
  /** Task description (truncated) */
  task: string;
  /** Data specific to entry type */
  data: RoutingLogData | WorkflowLogData | PhaseLogData | CascadeLogData;
}

export interface RoutingLogData {
  selectedAI: string;
  confidence: number;
  matchedKeywords: string[];
  ranking: Array<{ ai: string; score: number }>;
  difficulty?: string;
  recommendedWorkflow?: string;
  /** Whether the user overrode the auto-selected AI */
  userOverride?: string;
  /** Primary keyword category that triggered routing */
  primaryCategory?: string;
}

export interface WorkflowLogData {
  workflowName: string;
  level: string;
  success: boolean;
  durationMs: number;
  phaseCount: number;
  error?: string;
}

export interface PhaseLogData {
  phaseName: string;
  phaseType: string;
  assignedAI: string;
  success: boolean;
  durationMs: number;
  outputLength: number;
  error?: string;
  /** Token usage if available from the bridge response */
  tokenUsage?: { input?: number; output?: number };
  /** Whether this was a retry or fallback attempt */
  retryAttempt?: number;
  fallbackFrom?: string;
}

export interface CascadeLogData {
  steps: Array<{ ai: string; attempted: boolean; success: boolean; durationMs: number }>;
  finalAI: string;
  totalDurationMs: number;
}

// ============================================
// Success Rate Tracker
// ============================================

export interface SuccessRateEntry {
  ai: string;
  category: string;
  attempts: number;
  successes: number;
  rate: number;
}

// ============================================
// Logger Implementation
// ============================================

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_TASK_LENGTH = 200;

export class ExecutionLogger {
  private logDir: string;
  private logPath: string;

  constructor(projectRoot?: string) {
    this.logDir = join(homedir(), '.maw', 'logs');
    this.logPath = join(this.logDir, 'executions.jsonl');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Append a log entry (JSON-lines format)
   */
  private append(entry: ExecutionLogEntry): void {
    try {
      this.rotateIfNeeded();
      const line = JSON.stringify(entry) + '\n';
      appendFileSync(this.logPath, line, 'utf-8');
    } catch {
      // Logging is best-effort — never break the main flow
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (existsSync(this.logPath) && statSync(this.logPath).size > MAX_LOG_SIZE) {
        const rotatedPath = this.logPath.replace('.jsonl', `.${Date.now()}.jsonl`);
        renameSync(this.logPath, rotatedPath);
      }
    } catch {
      // Ignore rotation errors
    }
  }

  /**
   * Log a routing decision
   */
  logRouting(task: string, data: RoutingLogData): void {
    this.append({
      timestamp: new Date().toISOString(),
      type: 'routing',
      task: task.slice(0, MAX_TASK_LENGTH),
      data,
    });
  }

  /**
   * Log a workflow execution result
   */
  logWorkflow(task: string, data: WorkflowLogData): void {
    this.append({
      timestamp: new Date().toISOString(),
      type: 'workflow',
      task: task.slice(0, MAX_TASK_LENGTH),
      data,
    });
  }

  /**
   * Log a phase execution result
   */
  logPhase(task: string, data: PhaseLogData): void {
    this.append({
      timestamp: new Date().toISOString(),
      type: 'phase',
      task: task.slice(0, MAX_TASK_LENGTH),
      data,
    });
  }

  /**
   * Log a cascade attempt
   */
  logCascade(task: string, data: CascadeLogData): void {
    this.append({
      timestamp: new Date().toISOString(),
      type: 'cascade',
      task: task.slice(0, MAX_TASK_LENGTH),
      data,
    });
  }

  /**
   * Read all log entries (for analysis)
   */
  readAll(): ExecutionLogEntry[] {
    if (!existsSync(this.logPath)) return [];
    try {
      const content = readFileSync(this.logPath, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  /**
   * Compute success rates per AI per task category.
   * Categories are derived from the first matched keyword in routing logs.
   */
  getSuccessRates(): SuccessRateEntry[] {
    const entries = this.readAll();
    const counters = new Map<string, { attempts: number; successes: number }>();

    // Correlate routing decisions with workflow outcomes
    for (const entry of entries) {
      if (entry.type === 'workflow') {
        const data = entry.data as WorkflowLogData;
        // Use workflow name as a rough category proxy
        const key = `${data.workflowName}`;
        const counter = counters.get(key) || { attempts: 0, successes: 0 };
        counter.attempts++;
        if (data.success) counter.successes++;
        counters.set(key, counter);
      }
      if (entry.type === 'phase') {
        const data = entry.data as PhaseLogData;
        const key = `${data.assignedAI}:${data.phaseType}`;
        const counter = counters.get(key) || { attempts: 0, successes: 0 };
        counter.attempts++;
        if (data.success) counter.successes++;
        counters.set(key, counter);
      }
    }

    const rates: SuccessRateEntry[] = [];
    for (const [key, counter] of counters) {
      const [ai, category] = key.includes(':') ? key.split(':') : ['all', key];
      rates.push({
        ai,
        category,
        attempts: counter.attempts,
        successes: counter.successes,
        rate: counter.attempts > 0 ? counter.successes / counter.attempts : 0,
      });
    }

    return rates.sort((a, b) => b.rate - a.rate);
  }

  /**
   * Compute per-AI score adjustments based on historical performance.
   * Returns a map of AI name -> multiplier (0.8 to 1.2).
   *
   * Used by the semantic router's historical adjustment feature.
   */
  getRoutingAdjustments(): Map<string, number> {
    const entries = this.readAll();
    const counters = new Map<string, { attempts: number; successes: number; totalDuration: number }>();

    for (const entry of entries) {
      if (entry.type === 'phase') {
        const data = entry.data as PhaseLogData;
        const key = data.assignedAI;
        const counter = counters.get(key) || { attempts: 0, successes: 0, totalDuration: 0 };
        counter.attempts++;
        if (data.success) counter.successes++;
        counter.totalDuration += data.durationMs;
        counters.set(key, counter);
      }
    }

    const adjustments = new Map<string, number>();
    for (const [ai, counter] of counters) {
      if (counter.attempts < 3) continue;
      const successRate = counter.successes / counter.attempts;
      // Multiplier: 0.8 (0% success) to 1.2 (100% success)
      adjustments.set(ai, 0.8 + 0.4 * successRate);
    }

    return adjustments;
  }

  /**
   * Detect patterns where users consistently override routing decisions.
   * If the auto-router picks AI X but the user always overrides to AI Y
   * for a given category, this signals the router should prefer Y.
   */
  getOverridePatterns(): Array<{ category: string; autoSelected: string; overriddenTo: string; count: number }> {
    const entries = this.readAll();
    const overrides = new Map<string, number>();

    for (const entry of entries) {
      if (entry.type === 'routing') {
        const data = entry.data as RoutingLogData;
        if (data.userOverride && data.userOverride !== data.selectedAI) {
          const category = data.primaryCategory || 'general';
          const key = `${category}:${data.selectedAI}->${data.userOverride}`;
          overrides.set(key, (overrides.get(key) || 0) + 1);
        }
      }
    }

    const patterns: Array<{ category: string; autoSelected: string; overriddenTo: string; count: number }> = [];
    for (const [key, count] of overrides) {
      if (count < 2) continue;
      const [category, transition] = key.split(':');
      const [autoSelected, overriddenTo] = transition.split('->');
      patterns.push({ category, autoSelected, overriddenTo, count });
    }

    return patterns.sort((a, b) => b.count - a.count);
  }

  /**
   * Get aggregate metrics for display (e.g., in dashboard or stats command).
   */
  getAggregateMetrics(): {
    totalExecutions: number;
    successRate: number;
    avgDurationMs: number;
    perAI: Array<{ ai: string; executions: number; successRate: number; avgDurationMs: number }>;
  } {
    const entries = this.readAll();
    let totalExecutions = 0;
    let totalSuccesses = 0;
    let totalDuration = 0;

    const perAI = new Map<string, { executions: number; successes: number; totalDuration: number }>();

    for (const entry of entries) {
      if (entry.type === 'phase') {
        const data = entry.data as PhaseLogData;
        totalExecutions++;
        if (data.success) totalSuccesses++;
        totalDuration += data.durationMs;

        const ai = data.assignedAI;
        const stats = perAI.get(ai) || { executions: 0, successes: 0, totalDuration: 0 };
        stats.executions++;
        if (data.success) stats.successes++;
        stats.totalDuration += data.durationMs;
        perAI.set(ai, stats);
      }
    }

    return {
      totalExecutions,
      successRate: totalExecutions > 0 ? totalSuccesses / totalExecutions : 0,
      avgDurationMs: totalExecutions > 0 ? totalDuration / totalExecutions : 0,
      perAI: Array.from(perAI.entries()).map(([ai, stats]) => ({
        ai,
        executions: stats.executions,
        successRate: stats.executions > 0 ? stats.successes / stats.executions : 0,
        avgDurationMs: stats.executions > 0 ? stats.totalDuration / stats.executions : 0,
      })).sort((a, b) => b.executions - a.executions),
    };
  }
}

/** Singleton logger instance */
let _logger: ExecutionLogger | null = null;

export function getExecutionLogger(): ExecutionLogger {
  if (!_logger) {
    _logger = new ExecutionLogger();
  }
  return _logger;
}
