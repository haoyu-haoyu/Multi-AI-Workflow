/**
 * Delegate Commands
 *
 * Implements AI delegation (from skills pattern) and collaboration.
 */

import chalk from 'chalk';
import ora from 'ora';
import { WorkflowEngine, WorkflowContext } from '../core/workflow-engine.js';
import { SandboxLevel } from '../adapters/base-adapter.js';
import { loadConfig } from '../config/loader.js';
import { analyzeTaskForRouting, AI_PROFILES, estimateTaskDifficulty, buildCascadePlan } from '../core/semantic-router.js';
import { getExecutionLogger } from '../core/execution-logger.js';
import { MAWRuntime } from '../runtime/maw-runtime.js';

interface DelegateOptions {
  sandbox: string;
  session?: string;
  cd: string;
  stream: boolean;
}

interface SemanticRouteOptions {
  cd: string;
  sandbox: string;
  prefer?: string;
}

interface CollaborateOptions {
  planner: string;
  executors: string;
  parallel: boolean;
}

/**
 * Delegate task to external AI
 */
export async function delegateToAI(
  ai: string,
  task: string,
  options: DelegateOptions
): Promise<void> {
  const spinner = ora(`Delegating to ${ai}...`).start();

  try {
    const config = loadConfig();
    const runtime = MAWRuntime.createConfiguredRuntime(config, options.cd);

    if (!runtime.hasProvider(ai)) {
      spinner.fail(chalk.red(`Unknown AI: ${ai}`));
      console.log(chalk.dim(`Available: ${runtime.listProviders().join(', ')}`));
      return;
    }

    spinner.text = `${ai} is processing...`;

    const { session, execution } = await runtime.delegate({
      provider: ai,
      task,
      projectRoot: options.cd,
      sessionId: options.session,
      stream: options.stream,
      policy: {
        sandbox: options.sandbox as SandboxLevel,
        allowNetwork: false,
        writableRoots: [options.cd],
        trustLevel: 'interactive',
        requiresApprovalFor: [],
      },
    });

    if (execution.success) {
      spinner.succeed(chalk.green(`${ai} completed`));

      // Save SESSION_ID for future use
      if (execution.sessionId) {
        console.log(chalk.dim('\nSESSION_ID:'), execution.sessionId);
      }

      console.log(chalk.dim('MAW Session:'), session.mawSessionId);
      console.log(chalk.dim('Sandbox:'), options.sandbox);

      // Display result
      console.log(chalk.cyan('\n--- Response ---\n'));
      console.log(execution.content);

      // Show artifacts if any
      if (execution.artifacts && execution.artifacts.length > 0) {
        console.log(chalk.cyan('\n--- Artifacts ---'));
        for (const artifact of execution.artifacts) {
          console.log(chalk.dim(`\n[${artifact.type}] ${artifact.language || ''}`));
          console.log(artifact.content.substring(0, 500));
          if (artifact.content.length > 500) {
            console.log(chalk.dim('... (truncated)'));
          }
        }
      }
    } else {
      spinner.fail(chalk.red(`${ai} failed`));
      console.error(chalk.red(execution.error));
    }
  } catch (error) {
    spinner.fail(chalk.red('Delegation error'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Execute multi-AI collaboration
 */
export async function executeCollaboration(
  task: string,
  options: CollaborateOptions
): Promise<void> {
  const executors = options.executors.split(',').map(e => e.trim());

  const spinner = ora(
    `Starting collaboration: ${options.planner} (plan) + ${executors.join(', ')} (execute)`
  ).start();

  try {
    const config = loadConfig();
    const runtime = MAWRuntime.createConfiguredRuntime(config, process.cwd());

    // Create collaborate workflow
    const workflow = WorkflowEngine.createCollaborateWorkflow();

    // Adjust workflow based on options
    if (!options.parallel) {
      workflow.parallelConfig = {
        maxConcurrency: 1,
        dependencyAware: true,
      };
    }

    const context: WorkflowContext = {
      projectRoot: process.cwd(),
      task,
    };

    spinner.text = 'Claude is planning...';
    const result = await runtime.executeWorkflow(workflow, context);

    if (result.success) {
      spinner.succeed(chalk.green('Collaboration completed'));

      console.log(chalk.dim('\nSession:'), result.session.mawSessionId);
      console.log(chalk.dim('Planner:'), options.planner);
      console.log(chalk.dim('Executors:'), executors.join(', '));
      console.log(chalk.dim('Parallel:'), options.parallel);

      // Show task breakdown
      console.log(chalk.cyan('\n--- Task Breakdown ---'));
      for (const task of result.tasks) {
        const icon = task.status === 'completed' ? '✓' : task.status === 'failed' ? '✗' : '○';
        const color = task.status === 'completed' ? chalk.green : task.status === 'failed' ? chalk.red : chalk.yellow;
        console.log(color(`  ${icon} [${task.assignedAI}] ${task.description}`));
      }

      // Show AI session IDs for continuation
      console.log(chalk.cyan('\n--- Session IDs (for continuation) ---'));
      const aiSessions = result.session.aiSessions;
      for (const [ai, sessionId] of Object.entries(aiSessions)) {
        if (sessionId) {
          console.log(chalk.dim(`  ${ai}:`), sessionId);
        }
      }
    } else {
      spinner.fail(chalk.red('Collaboration failed'));
      console.error(chalk.red(result.error));
    }
  } catch (error) {
    spinner.fail(chalk.red('Collaboration error'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Semantic routing - auto-select AI based on task description
 * Core CCW feature for natural language CLI invocation
 */
export async function semanticRoute(
  task: string,
  options: SemanticRouteOptions
): Promise<void> {
  console.log(chalk.cyan('🔍 Analyzing task for optimal AI routing...\n'));

  // Analyze task
  const analysis = analyzeTaskForRouting(task);
  const difficulty = estimateTaskDifficulty(task);

  // Log the routing decision
  getExecutionLogger().logRouting(task, {
    selectedAI: analysis.ai,
    confidence: analysis.confidence,
    matchedKeywords: analysis.reasons,
    ranking: analysis.ranking.map(r => ({ ai: r.ai, score: r.score })),
    difficulty: difficulty.difficulty,
    recommendedWorkflow: difficulty.recommendedWorkflow,
  });

  // Apply preference override if specified
  let selectedAI = analysis.ai;
  if (options.prefer) {
    const prefer = options.prefer.toLowerCase();
    if (['codex', 'gemini', 'claude'].includes(prefer)) {
      selectedAI = prefer;
      console.log(chalk.dim(`Using preferred AI: ${selectedAI}`));
    }
  }

  // Display routing decision
  console.log(chalk.bold('Routing Decision:'));
  console.log(chalk.dim('  Task:'), task.substring(0, 80) + (task.length > 80 ? '...' : ''));
  console.log(chalk.dim('  Selected AI:'), chalk.green(selectedAI));
  console.log(chalk.dim('  Confidence:'), `${Math.round(analysis.confidence * 100)}%`);

  if (analysis.reasons.length > 0) {
    console.log(chalk.dim('  Matched keywords:'), analysis.reasons.join(', '));
  }

  // Show ranking
  if (analysis.ranking) {
    console.log(chalk.dim('  Ranking:'), analysis.ranking.map(r => `${r.ai}(${r.score.toFixed(1)})`).join(' > '));
  }

  if (analysis.cascadeRecommended) {
    const cascade = buildCascadePlan(task);
    console.log(chalk.yellow('  Cascade:'), cascade.map(s => `${s.ai}[${s.cost}]`).join(' -> '));
  }

  // Show AI strengths
  const profile = AI_PROFILES[selectedAI];
  if (profile?.strengths.length) {
    console.log(chalk.dim('  AI strengths:'), profile.strengths.join(', '));
  }

  console.log();

  await delegateToAI(selectedAI, task, {
    sandbox: options.sandbox,
    cd: options.cd,
    stream: false,
  });
}
