/**
 * Workflow Commands
 *
 * Implements /workflow:* commands for CCW's 4-level workflow system.
 */

import chalk from 'chalk';
import ora from 'ora';
import { WorkflowEngine, WorkflowContext } from '../core/workflow-engine.js';
import { loadConfig } from '../config/loader.js';
import { estimateTaskDifficulty } from '../core/semantic-router.js';
import { composeWorkflow } from '../core/workflow-composer.js';
import { MAWRuntime } from '../runtime/maw-runtime.js';

/**
 * Execute Level 1: lite workflow
 */
export async function executeLiteWorkflow(task: string, options: { cd?: string } = {}): Promise<void> {
  const spinner = ora('Executing lite workflow...').start();

  try {
    const config = loadConfig();
    const runtime = MAWRuntime.createConfiguredRuntime(config, options.cd);

    const workflow = WorkflowEngine.createLiteWorkflow();
    const context: WorkflowContext = {
      projectRoot: options.cd || process.cwd(),
      task,
    };

    const result = await runtime.executeWorkflow(workflow, context);

    if (result.success) {
      spinner.succeed(chalk.green('Lite workflow completed'));
      console.log(chalk.dim('\nSession:'), result.session.mawSessionId);
    } else {
      spinner.fail(chalk.red('Workflow failed'));
      console.error(chalk.red(result.error));
    }
  } catch (error) {
    spinner.fail(chalk.red('Workflow error'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Execute Level 2-3: plan workflows
 */
export async function executePlanWorkflow(
  task: string,
  options: { level: string; cd?: string }
): Promise<void> {
  const spinner = ora(`Executing ${options.level} workflow...`).start();

  try {
    const config = loadConfig();
    const runtime = MAWRuntime.createConfiguredRuntime(config, options.cd);

    // Create appropriate workflow
    let workflow;
    switch (options.level) {
      case 'lite-plan':
        workflow = WorkflowEngine.createLitePlanWorkflow();
        break;
      case 'tdd-plan':
        workflow = WorkflowEngine.createTDDPlanWorkflow(task);
        break;
      default:
        workflow = WorkflowEngine.createPlanWorkflow();
    }

    const context: WorkflowContext = {
      projectRoot: options.cd || process.cwd(),
      task,
    };

    spinner.text = 'Planning...';
    const result = await runtime.executeWorkflow(workflow, context);

    if (result.success) {
      spinner.succeed(chalk.green(`${options.level} workflow completed`));
      console.log(chalk.dim('\nSession:'), result.session.mawSessionId);
      console.log(chalk.dim('Tasks:'), result.tasks.length);

      // Show task summary
      for (const task of result.tasks) {
        const icon = task.status === 'completed' ? '✓' : task.status === 'failed' ? '✗' : '○';
        const color = task.status === 'completed' ? chalk.green : task.status === 'failed' ? chalk.red : chalk.yellow;
        console.log(color(`  ${icon} ${task.description}`));
      }
    } else {
      spinner.fail(chalk.red('Workflow failed'));
      console.error(chalk.red(result.error));
    }
  } catch (error) {
    spinner.fail(chalk.red('Workflow error'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Execute Level 4: brainstorm workflow
 */
export async function executeBrainstorm(
  topic: string,
  options: { parallel: boolean; roles: string; cd?: string }
): Promise<void> {
  const spinner = ora('Starting brainstorm session...').start();

  try {
    const config = loadConfig();
    const runtime = MAWRuntime.createConfiguredRuntime(config, options.cd);

    const workflow = WorkflowEngine.createBrainstormWorkflow(options.parallel);
    const context: WorkflowContext = {
      projectRoot: options.cd || process.cwd(),
      task: topic,
    };

    spinner.text = options.parallel
      ? 'Running parallel brainstorm with Codex and Gemini...'
      : 'Running sequential brainstorm...';

    const result = await runtime.executeWorkflow(workflow, context);

    if (result.success) {
      spinner.succeed(chalk.green('Brainstorm completed'));
      console.log(chalk.dim('\nSession:'), result.session.mawSessionId);
      console.log(chalk.dim('Roles involved:'), options.roles);
      console.log(chalk.dim('Parallel:'), options.parallel);

      // Show insights from each AI
      for (const task of result.tasks) {
        console.log(chalk.cyan(`\n${task.assignedAI}:`));
        if (task.result) {
          console.log(chalk.dim(task.result.substring(0, 200) + '...'));
        }
      }
    } else {
      spinner.fail(chalk.red('Brainstorm failed'));
      console.error(chalk.red(result.error));
    }
  } catch (error) {
    spinner.fail(chalk.red('Brainstorm error'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Execute Self-MoA workflow - Claude generates multiple perspectives,
 * then synthesizes the best approach. High quality, single model.
 *
 * Research (Self-MoA, 2025): outperforms multi-model MoA by 6.6%
 */
export async function executeSelfMoA(
  task: string,
  options: { cd?: string }
): Promise<void> {
  console.log(chalk.cyan('\n--- Self-MoA: Multi-Perspective Synthesis ---\n'));
  const spinner = ora('Generating 3 expert perspectives in parallel...').start();

  try {
    const config = loadConfig();
    const runtime = MAWRuntime.createConfiguredRuntime(config, options.cd);
    const workflow = WorkflowEngine.createSelfMoAWorkflow(task);
    const context: WorkflowContext = {
      projectRoot: options.cd || process.cwd(),
      task,
    };

    const result = await runtime.executeWorkflow(workflow, context);

    if (result.success) {
      spinner.succeed(chalk.green('Self-MoA completed'));
      console.log(chalk.dim('\nSession:'), result.session.mawSessionId);
      for (const t of result.tasks) {
        const icon = t.status === 'completed' ? chalk.green('v') : chalk.red('x');
        console.log(`  ${icon} ${t.description}`);
      }
    } else {
      spinner.fail(chalk.red('Self-MoA failed'));
      console.error(chalk.red(result.error));
    }
  } catch (error) {
    spinner.fail(chalk.red('Self-MoA error'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Execute auto workflow - automatically selects the best workflow
 * based on task difficulty estimation.
 *
 * Inspired by DAAO (WWW 2026) difficulty-aware orchestration
 * and the 45% Threshold Rule.
 */
export async function executeAutoWorkflow(
  task: string,
  options: { cd?: string; parallel: boolean; verbose: boolean }
): Promise<void> {
  // Step 1: Estimate difficulty
  const estimate = estimateTaskDifficulty(task);

  if (options.verbose) {
    console.log(chalk.cyan('\n--- Difficulty Analysis ---'));
    console.log(chalk.dim('  Difficulty:'), chalk.bold(estimate.difficulty));
    console.log(chalk.dim('  Score:'), estimate.score.toFixed(1));
    console.log(chalk.dim('  Signals:'), estimate.signals.join(', ') || 'none');
    console.log(chalk.dim('  Workflow:'), chalk.green(estimate.recommendedWorkflow));
    console.log();
  } else {
    console.log(chalk.dim(`[auto] difficulty=${estimate.difficulty} -> workflow=${estimate.recommendedWorkflow}`));
  }

  // Step 2: Use adaptive workflow composer for dynamic workflow generation
  const spinner = ora(`Executing adaptive ${estimate.difficulty} workflow...`).start();

  try {
    const config = loadConfig();
    const runtime = MAWRuntime.createConfiguredRuntime(config, options.cd);
    const workflow = composeWorkflow(task);
    const context: WorkflowContext = {
      projectRoot: options.cd || process.cwd(),
      task,
    };

    if (options.verbose) {
      console.log(chalk.dim(`  Composed: ${workflow.phases.length} phases from ${workflow.description}`));
    }

    const result = await runtime.executeWorkflow(workflow, context);

    if (result.success) {
      spinner.succeed(chalk.green(`Auto workflow completed (${estimate.difficulty})`));
      console.log(chalk.dim('\nSession:'), result.session.mawSessionId);
      for (const t of result.tasks) {
        const icon = t.status === 'completed' ? chalk.green('v') : chalk.red('x');
        console.log(`  ${icon} [${t.assignedAI}] ${t.description}`);
      }
    } else {
      spinner.fail(chalk.red('Auto workflow failed'));
      console.error(chalk.red(result.error));
    }
  } catch (error) {
    spinner.fail(chalk.red('Auto workflow error'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Execute 5-Phase collaboration workflow (from GuDaStudio/skills pattern)
 *
 * Phase 1: Context Retrieval - Find relevant files
 * Phase 2: Multi-Model Analysis - Parallel analysis by Codex and Gemini
 * Phase 3: Prototype Generation - Generate unified diff patches (read-only)
 * Phase 4: Implementation - Claude refactors and applies changes
 * Phase 5: Audit - Security and quality review
 */
export async function executeFivePhase(
  task: string,
  options: { parallel: boolean; cd?: string }
): Promise<void> {
  console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║  5-Phase Collaboration Workflow (Skills Pattern)             ║'));
  console.log(chalk.cyan('║  Context → Analysis → Prototype → Implement → Audit         ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝\n'));

  const spinner = ora('Initializing 5-phase workflow...').start();

  try {
    const config = loadConfig();
    const runtime = MAWRuntime.createConfiguredRuntime(config, options.cd);

    const workflow = WorkflowEngine.createFivePhaseWorkflow(task);

    // Adjust parallelism if needed
    if (!options.parallel) {
      workflow.parallelConfig = {
        maxConcurrency: 1,
        dependencyAware: true,
      };
    }

    const context: WorkflowContext = {
      projectRoot: options.cd || process.cwd(),
      task,
    };

    // Execute with phase tracking
    const phases = [
      { id: 'context', name: 'Context Retrieval', icon: '📂' },
      { id: 'analysis-codex', name: 'Codex Analysis', icon: '🔍' },
      { id: 'analysis-gemini', name: 'Gemini Analysis', icon: '🔍' },
      { id: 'prototype', name: 'Prototype Generation', icon: '📝' },
      { id: 'implement', name: 'Implementation', icon: '🔧' },
      { id: 'audit', name: 'Security & Quality Audit', icon: '🛡️' },
    ];

    spinner.text = `Phase 1/5: ${phases[0].icon} ${phases[0].name}...`;
    const result = await runtime.executeWorkflow(workflow, context);

    if (result.success) {
      spinner.succeed(chalk.green('5-Phase workflow completed successfully'));

      console.log(chalk.dim('\n┌─────────────────────────────────────────┐'));
      console.log(chalk.dim('│ Session:'), result.session.mawSessionId.substring(0, 8) + '...');
      console.log(chalk.dim('│ Parallel:'), options.parallel);
      console.log(chalk.dim('│ Total Tasks:'), result.tasks.length);
      console.log(chalk.dim('└─────────────────────────────────────────┘'));

      // Show phase summary
      console.log(chalk.cyan('\n--- Phase Summary ---'));
      for (const task of result.tasks) {
        const phase = phases.find(p => p.id === task.id) || { icon: '○', name: task.description };
        const icon = task.status === 'completed' ? '✓' : task.status === 'failed' ? '✗' : '○';
        const color = task.status === 'completed' ? chalk.green : task.status === 'failed' ? chalk.red : chalk.yellow;
        console.log(color(`  ${icon} ${phase.icon || ''} [${task.assignedAI}] ${task.description}`));
      }

      // Show AI session IDs for continuation
      console.log(chalk.cyan('\n--- AI Session IDs (for continuation) ---'));
      const aiSessions = result.session.aiSessions;
      for (const [ai, sessionId] of Object.entries(aiSessions)) {
        if (sessionId) {
          console.log(chalk.dim(`  ${ai}:`), sessionId);
        }
      }

      // Security note
      console.log(chalk.yellow('\n⚠️  Note: External AIs (Codex/Gemini) operated in read-only mode.'));
      console.log(chalk.dim('   All file modifications were performed by Claude after review.'));
    } else {
      spinner.fail(chalk.red('5-Phase workflow failed'));
      console.error(chalk.red(result.error));
    }
  } catch (error) {
    spinner.fail(chalk.red('Workflow error'));
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}
