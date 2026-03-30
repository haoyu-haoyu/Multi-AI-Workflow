/**
 * Stats Command
 *
 * Shows execution statistics and AI success rates from the
 * execution logger. Part of the self-evolution feedback loop.
 *
 * Inspired by:
 * - Self-Evolving AI Agents Survey (2025)
 * - HyperAgent (Meta, 2026): LLM-analyzed failure for targeted improvements
 */

import chalk from 'chalk';
import { getExecutionLogger, type ExecutionLogEntry, type RoutingLogData, type WorkflowLogData } from '../core/execution-logger.js';

interface StatsOptions {
  json: boolean;
}

export async function showStats(options: StatsOptions): Promise<void> {
  const logger = getExecutionLogger();
  const entries = logger.readAll();

  if (entries.length === 0) {
    console.log(chalk.yellow('No execution logs found yet.'));
    console.log(chalk.dim('Run some workflows to start collecting data.'));
    return;
  }

  // Compute statistics
  const stats = computeStats(entries);

  if (options.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  // Pretty print
  console.log(chalk.cyan('\n--- MAW Execution Statistics ---\n'));
  console.log(chalk.dim('Total executions:'), stats.totalExecutions);
  console.log(chalk.dim('Date range:'), `${stats.firstExecution} -> ${stats.lastExecution}`);

  // Routing stats
  if (stats.routingDecisions.length > 0) {
    console.log(chalk.cyan('\n--- Routing Decisions ---'));
    for (const rd of stats.routingDecisions) {
      const bar = '|'.repeat(Math.round(rd.percentage));
      console.log(`  ${chalk.bold(rd.ai.padEnd(8))} ${bar} ${rd.count} (${rd.percentage.toFixed(0)}%)`);
    }
    console.log(chalk.dim(`  Avg confidence: ${(stats.avgConfidence * 100).toFixed(1)}%`));
  }

  // Workflow success rates
  if (stats.workflowRates.length > 0) {
    console.log(chalk.cyan('\n--- Workflow Success Rates ---'));
    for (const wr of stats.workflowRates) {
      const color = wr.rate >= 0.8 ? chalk.green : wr.rate >= 0.5 ? chalk.yellow : chalk.red;
      console.log(`  ${wr.workflow.padEnd(15)} ${color(`${(wr.rate * 100).toFixed(0)}%`)} (${wr.successes}/${wr.attempts})`);
    }
  }

  // AI performance
  if (stats.aiPerformance.length > 0) {
    console.log(chalk.cyan('\n--- AI Performance (per phase type) ---'));
    for (const ap of stats.aiPerformance) {
      const color = ap.rate >= 0.8 ? chalk.green : ap.rate >= 0.5 ? chalk.yellow : chalk.red;
      console.log(`  ${ap.ai.padEnd(8)} ${ap.category.padEnd(12)} ${color(`${(ap.rate * 100).toFixed(0)}%`)} (${ap.successes}/${ap.attempts})`);
    }
  }

  // Difficulty distribution
  if (stats.difficultyDistribution.length > 0) {
    console.log(chalk.cyan('\n--- Task Difficulty Distribution ---'));
    for (const dd of stats.difficultyDistribution) {
      const bar = '#'.repeat(Math.round(dd.percentage / 2));
      console.log(`  ${dd.difficulty.padEnd(10)} ${bar} ${dd.count} (${dd.percentage.toFixed(0)}%)`);
    }
  }

  console.log();
}

interface StatsResult {
  totalExecutions: number;
  firstExecution: string;
  lastExecution: string;
  routingDecisions: Array<{ ai: string; count: number; percentage: number }>;
  avgConfidence: number;
  workflowRates: Array<{ workflow: string; attempts: number; successes: number; rate: number }>;
  aiPerformance: Array<{ ai: string; category: string; attempts: number; successes: number; rate: number }>;
  difficultyDistribution: Array<{ difficulty: string; count: number; percentage: number }>;
}

function computeStats(entries: ExecutionLogEntry[]): StatsResult {
  const timestamps = entries.map(e => e.timestamp).sort();

  // Routing decisions
  const routingEntries = entries.filter(e => e.type === 'routing');
  const aiCounts = new Map<string, number>();
  let totalConfidence = 0;

  for (const e of routingEntries) {
    const data = e.data as RoutingLogData;
    aiCounts.set(data.selectedAI, (aiCounts.get(data.selectedAI) || 0) + 1);
    totalConfidence += data.confidence;
  }

  const routingDecisions = [...aiCounts.entries()]
    .map(([ai, count]) => ({
      ai,
      count,
      percentage: routingEntries.length > 0 ? (count / routingEntries.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Workflow success rates
  const workflowEntries = entries.filter(e => e.type === 'workflow');
  const workflowCounters = new Map<string, { attempts: number; successes: number }>();

  for (const e of workflowEntries) {
    const data = e.data as WorkflowLogData;
    const counter = workflowCounters.get(data.workflowName) || { attempts: 0, successes: 0 };
    counter.attempts++;
    if (data.success) counter.successes++;
    workflowCounters.set(data.workflowName, counter);
  }

  const workflowRates = [...workflowCounters.entries()]
    .map(([workflow, counter]) => ({
      workflow,
      ...counter,
      rate: counter.attempts > 0 ? counter.successes / counter.attempts : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  // AI performance from execution logger
  const aiPerformance = getExecutionLogger().getSuccessRates();

  // Difficulty distribution
  const difficultyCounts = new Map<string, number>();
  for (const e of routingEntries) {
    const data = e.data as RoutingLogData;
    if (data.difficulty) {
      difficultyCounts.set(data.difficulty, (difficultyCounts.get(data.difficulty) || 0) + 1);
    }
  }

  const difficultyDistribution = [...difficultyCounts.entries()]
    .map(([difficulty, count]) => ({
      difficulty,
      count,
      percentage: routingEntries.length > 0 ? (count / routingEntries.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalExecutions: entries.length,
    firstExecution: timestamps[0] || 'N/A',
    lastExecution: timestamps[timestamps.length - 1] || 'N/A',
    routingDecisions,
    avgConfidence: routingEntries.length > 0 ? totalConfidence / routingEntries.length : 0,
    workflowRates,
    aiPerformance,
    difficultyDistribution,
  };
}
