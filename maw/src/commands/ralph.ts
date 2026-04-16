/**
 * Ralph Loop Commands
 *
 * Implements the "Ralph technique" - continuous AI agent loops for iterative development.
 * Named after Ralph Wiggum from The Simpsons, it embodies persistent iteration.
 *
 * Core concept: A loop that repeatedly feeds an AI agent a prompt, allowing it to
 * iteratively improve work until completion.
 */

import chalk from 'chalk';
import ora from 'ora';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { SessionManager } from '../core/session-manager.js';
import { loadConfig } from '../config/loader.js';
import { analyzeTaskForRouting } from '../core/semantic-router.js';
import { validatePathWithinBase } from '../core/skill-registry.js';
import { BridgePool } from '../core/bridge-pool.js';

interface RalphLoopOptions {
  maxIterations: number;
  completionPromise: string;
  ai: string;
  cd: string;
  sandbox: string;
  verbose: boolean;
  delay: number;
  /** Shell command to verify completion (exit 0 = complete). */
  verifyCommand?: string;
}

type CompletionMethod = 'string-match' | 'structured-json' | 'verify-command';

interface CompletionCheck {
  isComplete: boolean;
  method: CompletionMethod;
  summary?: string;
}

interface LoopState {
  iteration: number;
  startTime: Date;
  completed: boolean;
  cancelled: boolean;
  lastOutput: string;
  history: IterationRecord[];
}

interface IterationRecord {
  iteration: number;
  timestamp: Date;
  output: string;
  duration: number;
  hasCompletionPromise: boolean;
}

// Global state for cancellation
let currentLoopState: LoopState | null = null;

/**
 * Execute a Ralph Loop - iterative AI execution until completion
 */
export async function executeRalphLoop(
  prompt: string,
  options: RalphLoopOptions
): Promise<void> {
  const spinner = ora('Initializing Ralph Loop...').start();

  // Initialize state
  currentLoopState = {
    iteration: 0,
    startTime: new Date(),
    completed: false,
    cancelled: false,
    lastOutput: '',
    history: [],
  };

  // Validate and normalize AI provider
  const validAIs = ['claude', 'codex', 'gemini', 'auto'];
  options.ai = options.ai.toLowerCase();
  if (!validAIs.includes(options.ai)) {
    spinner.fail(chalk.red(`Invalid AI provider: "${options.ai}". Must be one of: ${validAIs.join(', ')}`));
    return;
  }

  const config = loadConfig();
  const sessionManager = new SessionManager(options.cd);

  // Create session for this Ralph loop
  const session = await sessionManager.createSession({
    name: `ralph-loop-${Date.now()}`,
    workflowLevel: 'ralph',
    projectRoot: options.cd,
  });

  spinner.succeed(chalk.green('Ralph Loop initialized'));

  // Display configuration
  console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.yellow('                    RALPH LOOP STARTED                      ') + chalk.cyan('║'));
  console.log(chalk.cyan('╠════════════════════════════════════════════════════════════╣'));
  console.log(chalk.cyan('║') + chalk.dim(` Session: ${session.mawSessionId.substring(0, 36)}...`) + chalk.cyan('   ║'));
  console.log(chalk.cyan('║') + chalk.dim(` AI: ${options.ai.padEnd(52)}`) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.dim(` Max Iterations: ${String(options.maxIterations).padEnd(40)}`) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.dim(` Completion Promise: ${options.completionPromise.substring(0, 35).padEnd(36)}`) + chalk.cyan('║'));
  console.log(chalk.cyan('╚════════════════════════════════════════════════════════════╝\n'));

  console.log(chalk.dim('Prompt:'), prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));
  console.log(chalk.dim('\nPress Ctrl+C to cancel the loop.\n'));

  // Setup cancellation handler
  const cancelHandler = () => {
    if (currentLoopState) {
      currentLoopState.cancelled = true;
      console.log(chalk.yellow('\n\n⚠️  Ralph Loop cancellation requested...'));
    }
  };
  process.on('SIGINT', cancelHandler);

  try {
    // Main loop
    while (
      currentLoopState.iteration < options.maxIterations &&
      !currentLoopState.completed &&
      !currentLoopState.cancelled
    ) {
      currentLoopState.iteration++;
      const iterationStart = Date.now();

      console.log(chalk.cyan(`\n┌─────────────────────────────────────────────────────────────┐`));
      console.log(chalk.cyan(`│`) + chalk.bold(` Iteration ${currentLoopState.iteration}/${options.maxIterations}`.padEnd(59)) + chalk.cyan(`│`));
      console.log(chalk.cyan(`└─────────────────────────────────────────────────────────────┘`));

      // Execute AI
      const iterationSpinner = ora(`${options.ai} is working...`).start();

      try {
        const output = await executeAI(options.ai, prompt, options, session.mawSessionId);
        const duration = Date.now() - iterationStart;

        // Multi-strategy completion check
        const completion = await checkCompletion(output, options);

        // Record iteration
        const record: IterationRecord = {
          iteration: currentLoopState.iteration,
          timestamp: new Date(),
          output: output.substring(0, 1000),
          duration,
          hasCompletionPromise: completion.isComplete,
        };
        currentLoopState.history.push(record);
        currentLoopState.lastOutput = output;

        if (completion.isComplete) {
          currentLoopState.completed = true;
          iterationSpinner.succeed(chalk.green(`Iteration ${currentLoopState.iteration} completed - Task done!`));

          console.log(chalk.green('\n✅ COMPLETION DETECTED'));
          console.log(chalk.dim(`   Method: ${completion.method}`));
          if (completion.summary) {
            console.log(chalk.dim(`   Detail: ${completion.summary}`));
          }
        } else {
          iterationSpinner.succeed(chalk.blue(`Iteration ${currentLoopState.iteration} completed (${(duration / 1000).toFixed(1)}s)`));

          if (options.verbose) {
            console.log(chalk.dim('\n--- Output Preview ---'));
            console.log(output.substring(0, 500) + (output.length > 500 ? '\n...(truncated)' : ''));
          }
        }

        // Delay between iterations (if not completed)
        if (!currentLoopState.completed && !currentLoopState.cancelled && options.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, options.delay));
        }

      } catch (error) {
        iterationSpinner.fail(chalk.red(`Iteration ${currentLoopState.iteration} failed`));
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));

        // Continue to next iteration on error (Ralph philosophy: persistence)
        if (options.verbose) {
          console.log(chalk.yellow('Continuing to next iteration despite error...'));
        }
      }
    }

    // Loop finished - display summary
    displayLoopSummary(currentLoopState, options);

    // Save loop history to file
    await saveLoopHistory(currentLoopState, options.cd, session.mawSessionId);

  } finally {
    process.removeListener('SIGINT', cancelHandler);
    currentLoopState = null;
  }
}

/**
 * Multi-strategy completion detection.
 *
 * Checks in order of reliability:
 * 1. Verify command (if configured): runs a shell command, exit 0 = complete
 * 2. Structured JSON: looks for {"status":"complete"} in output
 * 3. String match: falls back to the classic completionPromise substring check
 */
async function checkCompletion(
  output: string,
  options: RalphLoopOptions,
): Promise<CompletionCheck> {
  // Strategy 1: Shell verify command (most reliable — uses real system state)
  if (options.verifyCommand) {
    try {
      const { execSync } = await import('child_process');
      execSync(options.verifyCommand, {
        cwd: options.cd,
        timeout: 30_000,
        stdio: 'pipe',
      });
      return { isComplete: true, method: 'verify-command', summary: `"${options.verifyCommand}" exited 0` };
    } catch {
      // Command failed (non-zero exit) — not complete yet
    }
  }

  // Strategy 2: Structured JSON in output
  // Look for a JSON object with status: "complete" / "done" / "finished"
  const jsonPattern = /\{[^{}]*"status"\s*:\s*"(complete|done|finished)"[^{}]*\}/i;
  const jsonMatch = output.match(jsonPattern);
  if (jsonMatch) {
    let summary = '';
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      summary = parsed.summary || parsed.message || '';
    } catch { /* ignore parse error, the regex match is enough */ }
    return { isComplete: true, method: 'structured-json', summary };
  }

  // Strategy 3: Classic string match (backward compatible)
  if (options.completionPromise && output.includes(options.completionPromise)) {
    return { isComplete: true, method: 'string-match', summary: options.completionPromise };
  }

  return { isComplete: false, method: 'string-match' };
}

/**
 * Execute AI agent based on type
 */
async function executeAI(
  ai: string,
  prompt: string,
  options: RalphLoopOptions,
  sessionId: string
): Promise<string> {
  const config = loadConfig();

  switch (ai.toLowerCase()) {
    case 'claude':
      return await executeClaudeNative(prompt, options);

    case 'codex':
      return await executeCodexBridge(prompt, options, sessionId);

    case 'gemini':
      return await executeGeminiBridge(prompt, options, sessionId);

    case 'auto':
      // Auto-select based on task content (semantic routing)
      const selectedAI = analyzeTaskForRouting(prompt).ai;
      return await executeAI(selectedAI, prompt, options, sessionId);

    default:
      throw new Error(`Unknown AI: ${ai}. Use: claude, codex, gemini, or auto`);
  }
}

/**
 * Execute Claude natively (within Claude Code context)
 */
async function executeClaudeNative(prompt: string, options: RalphLoopOptions): Promise<string> {
  // For Claude, we output the prompt for the current Claude session to process
  // This creates a self-referential loop where Claude sees its previous work
  console.log(chalk.dim('\n[Claude Native Mode - Processing in current session]\n'));

  // Write prompt to a temp file that Claude can read
  const workDir = path.resolve(options.cd);
  const promptFile = path.resolve(workDir, '.ralph-prompt.md');
  validatePathWithinBase(promptFile, workDir);
  fs.writeFileSync(promptFile, `# Ralph Loop Iteration\n\n${prompt}\n\n---\n\nPlease complete this task. When finished, include the completion promise in your response.`);

  // Return instruction for Claude
  return `[Prompt written to ${promptFile}. Claude should read and execute this prompt, then continue the loop.]`;
}

/**
 * Execute Codex via BridgePool (daemon mode, process reuse).
 * Falls back to one-shot spawn if daemon unavailable.
 */
async function executeCodexBridge(
  prompt: string,
  options: RalphLoopOptions,
  sessionId: string
): Promise<string> {
  const pool = BridgePool.getInstance();
  const response = await pool.send('codex', {
    prompt,
    cd: options.cd,
    session_id: sessionId,
    sandbox: options.sandbox || 'workspace-write',
  });
  if (response.success) {
    return response.agent_messages || '';
  }
  throw new Error(response.error || 'Codex bridge returned failure');
}

/**
 * Execute Gemini via BridgePool (daemon mode, process reuse).
 */
async function executeGeminiBridge(
  prompt: string,
  options: RalphLoopOptions,
  sessionId: string
): Promise<string> {
  const pool = BridgePool.getInstance();
  const response = await pool.send('gemini', {
    prompt,
    cd: options.cd,
    session_id: sessionId,
  });
  if (response.success) {
    return response.agent_messages || '';
  }
  throw new Error(response.error || 'Gemini bridge returned failure');
}

/**
 * Display loop summary
 */
function displayLoopSummary(state: LoopState, options: RalphLoopOptions): void {
  const totalDuration = Date.now() - state.startTime.getTime();
  const avgIterationTime = state.history.length > 0
    ? state.history.reduce((sum, r) => sum + r.duration, 0) / state.history.length
    : 0;

  console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.yellow('                   RALPH LOOP SUMMARY                       ') + chalk.cyan('║'));
  console.log(chalk.cyan('╠════════════════════════════════════════════════════════════╣'));

  const status = state.completed
    ? chalk.green('✅ COMPLETED')
    : state.cancelled
      ? chalk.yellow('⚠️  CANCELLED')
      : chalk.red('❌ MAX ITERATIONS REACHED');

  console.log(chalk.cyan('║') + ` Status: ${status}`.padEnd(67) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.dim(` Total Iterations: ${state.iteration}`.padEnd(58)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.dim(` Total Duration: ${(totalDuration / 1000).toFixed(1)}s`.padEnd(58)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.dim(` Avg Iteration Time: ${(avgIterationTime / 1000).toFixed(1)}s`.padEnd(58)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚════════════════════════════════════════════════════════════╝'));

  if (!state.completed && !state.cancelled) {
    console.log(chalk.yellow('\n⚠️  Loop ended without completion promise.'));
    console.log(chalk.dim('   Consider: increasing --max-iterations or adjusting your prompt.'));
  }
}

/**
 * Save loop history to file
 */
async function saveLoopHistory(
  state: LoopState,
  workDir: string,
  sessionId: string
): Promise<void> {
  const historyDir = path.join(workDir, '.ralph');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  const historyFile = path.join(historyDir, `${sessionId}.json`);
  const historyData = {
    sessionId,
    startTime: state.startTime.toISOString(),
    endTime: new Date().toISOString(),
    totalIterations: state.iteration,
    completed: state.completed,
    cancelled: state.cancelled,
    history: state.history,
  };

  fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2));
  console.log(chalk.dim(`\nLoop history saved to: ${historyFile}`));
}

/**
 * Cancel current Ralph loop (can be called from another command)
 */
export function cancelRalphLoop(): boolean {
  if (currentLoopState) {
    currentLoopState.cancelled = true;
    return true;
  }
  return false;
}

/**
 * Get current loop status
 */
export function getRalphLoopStatus(): LoopState | null {
  return currentLoopState;
}
