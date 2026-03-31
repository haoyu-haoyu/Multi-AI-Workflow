/**
 * Delegate Commands
 *
 * Implements AI delegation (from skills pattern) and collaboration.
 */

import chalk from 'chalk';
import ora from 'ora';
import { WorkflowEngine, WorkflowContext } from '../core/workflow-engine.js';
import { SessionManager } from '../core/session-manager.js';
import { ClaudeAdapter, CodexAdapter, GeminiAdapter, SandboxLevel } from '../adapters/base-adapter.js';
import { loadConfig } from '../config/loader.js';
import { analyzeTaskForRouting, AI_PROFILES, estimateTaskDifficulty, buildCascadePlan } from '../core/semantic-router.js';
import { getExecutionLogger } from '../core/execution-logger.js';

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
    const sessionManager = new SessionManager(options.cd);

    // Get or create session
    let session;
    if (options.session) {
      session = await sessionManager.resumeSession(options.session);
      spinner.text = `Resuming session ${options.session.substring(0, 8)}...`;
    } else {
      session = await sessionManager.createSession({
        name: `delegate-${ai}-${Date.now()}`,
        workflowLevel: 'delegate',
        projectRoot: options.cd,
      });
    }

    // Get appropriate adapter
    let adapter;
    switch (ai.toLowerCase()) {
      case 'claude':
        adapter = new ClaudeAdapter({
          name: 'claude',
          enabled: true,
        });
        break;
      case 'codex':
        adapter = new CodexAdapter({
          name: 'codex',
          enabled: true,
          cliPath: config.ai.codex.cliPath,
        });
        break;
      case 'gemini':
        adapter = new GeminiAdapter({
          name: 'gemini',
          enabled: true,
          cliPath: config.ai.gemini.cliPath,
        });
        break;
      default:
        spinner.fail(chalk.red(`Unknown AI: ${ai}`));
        console.log(chalk.dim('Available: claude, codex, gemini'));
        return;
    }

    // Check if adapter is available
    const isAvailable = await adapter.isAvailable();
    if (!isAvailable) {
      spinner.fail(chalk.red(`${ai} CLI is not available`));
      console.log(chalk.dim(`Make sure ${ai} CLI is installed and in your PATH`));
      return;
    }

    spinner.text = `${ai} is processing...`;

    // Execute delegation
    const result = await adapter.execute({
      prompt: task,
      workingDir: options.cd,
      sandbox: options.sandbox as SandboxLevel,
      sessionId: session.aiSessions[ai as keyof typeof session.aiSessions],
      stream: options.stream,
    });

    if (result.success) {
      spinner.succeed(chalk.green(`${ai} completed`));

      // Save SESSION_ID for future use
      if (result.sessionId) {
        await sessionManager.linkExternalSession(
          session,
          ai as 'codex' | 'gemini',
          result.sessionId
        );
        console.log(chalk.dim('\nSESSION_ID:'), result.sessionId);
      }

      console.log(chalk.dim('MAW Session:'), session.mawSessionId);
      console.log(chalk.dim('Sandbox:'), options.sandbox);

      // Display result
      console.log(chalk.cyan('\n--- Response ---\n'));
      console.log(result.content);

      // Show artifacts if any
      if (result.artifacts && result.artifacts.length > 0) {
        console.log(chalk.cyan('\n--- Artifacts ---'));
        for (const artifact of result.artifacts) {
          console.log(chalk.dim(`\n[${artifact.type}] ${artifact.language || ''}`));
          console.log(artifact.content.substring(0, 500));
          if (artifact.content.length > 500) {
            console.log(chalk.dim('... (truncated)'));
          }
        }
      }
    } else {
      spinner.fail(chalk.red(`${ai} failed`));
      console.error(chalk.red(result.error));
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
    const engine = WorkflowEngine.createConfiguredEngine(config);

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
    const result = await engine.execute(workflow, context);

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

  // Execute with selected AI
  if (selectedAI === 'claude') {
    // Use Claude CLI for real execution
    const spinner = ora('Claude is processing...').start();
    try {
      const config = loadConfig();
      const adapter = new ClaudeAdapter({
        name: 'claude',
        enabled: true,
      });
      const result = await adapter.execute({
        prompt: task,
        workingDir: options.cd,
        sandbox: 'read-only',
      });
      if (result.success) {
        spinner.succeed(chalk.green('Claude completed'));
        console.log(chalk.cyan('\n--- Response ---'));
        console.log(result.content);
      } else {
        spinner.fail(chalk.red('Claude failed'));
        console.error(result.error || 'Unknown error');
      }
    } catch (error) {
      spinner.fail(chalk.red('Claude execution failed'));
      console.error(error instanceof Error ? error.message : 'Unknown error');
    }
  } else {
    // Delegate to external AI (Codex/Gemini)
    await delegateToAI(selectedAI, task, {
      sandbox: options.sandbox,
      cd: options.cd,
      stream: false,
    });
  }
}
