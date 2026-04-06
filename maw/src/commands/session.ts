/**
 * Session Commands
 *
 * Unified session management combining CCW and skills patterns.
 */

import chalk from 'chalk';
import { SessionManager, type WorkflowLevel } from '../core/session-manager.js';

/**
 * List all sessions
 */
export async function listSessions(options: { all: boolean }): Promise<void> {
  const sessionManager = new SessionManager();
  const sessions = sessionManager.listSessions(options.all);

  if (sessions.length === 0) {
    console.log(chalk.dim('No sessions found.'));
    console.log(chalk.dim('Create one with: maw session new <name>'));
    return;
  }

  console.log(chalk.bold('\nSessions:\n'));

  for (const session of sessions) {
    const statusColor =
      session.metadata.status === 'active' ? chalk.green :
      session.metadata.status === 'completed' ? chalk.blue :
      session.metadata.status === 'archived' ? chalk.dim :
      chalk.yellow;

    console.log(
      statusColor(`● ${session.name}`),
      chalk.dim(`(${session.mawSessionId.substring(0, 8)}...)`)
    );
    console.log(chalk.dim(`  Status: ${session.metadata.status}`));
    console.log(chalk.dim(`  Level: ${session.workflowSession?.level || 'N/A'}`));
    console.log(chalk.dim(`  Created: ${new Date(session.metadata.createdAt).toLocaleString()}`));

    // Show linked AI sessions
    const aiSessions = Object.entries(session.aiSessions).filter(([_, v]) => v);
    if (aiSessions.length > 0) {
      console.log(chalk.dim('  AI Sessions:'));
      for (const [ai, sessionId] of aiSessions) {
        console.log(chalk.dim(`    ${ai}: ${(sessionId as string).substring(0, 8)}...`));
      }
    }

    console.log();
  }

  console.log(chalk.dim(`Total: ${sessions.length} session(s)`));
  if (!options.all) {
    console.log(chalk.dim('Use --all to include archived sessions'));
  }
}

/**
 * Create new session
 */
export async function createSession(
  name: string,
  options: { level: string }
): Promise<void> {
  const sessionManager = new SessionManager();

  try {
    const session = await sessionManager.createSession({
      name,
      workflowLevel: options.level as WorkflowLevel,
      projectRoot: process.cwd(),
    });

    console.log(chalk.green('✓ Session created'));
    console.log(chalk.dim('  ID:'), session.mawSessionId);
    console.log(chalk.dim('  Name:'), session.name);
    console.log(chalk.dim('  Level:'), options.level);

    if (session.workflowSession) {
      console.log(chalk.dim('  Workflow dir:'), session.workflowSession.wfsPath);
    }

    console.log(chalk.dim('\nResume with:'), `maw session resume ${session.mawSessionId}`);
  } catch (error) {
    console.error(chalk.red('Failed to create session:'), error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Resume existing session
 */
export async function resumeSession(id: string): Promise<void> {
  const sessionManager = new SessionManager();

  try {
    const session = await sessionManager.resumeSession(id);

    console.log(chalk.green('✓ Session resumed'));
    console.log(chalk.dim('  ID:'), session.mawSessionId);
    console.log(chalk.dim('  Name:'), session.name);
    console.log(chalk.dim('  Status:'), session.metadata.status);

    // Show AI session IDs that can be used
    console.log(chalk.cyan('\nAI Session IDs (use with --session):'));
    for (const [ai, sessionId] of Object.entries(session.aiSessions)) {
      if (sessionId) {
        console.log(chalk.dim(`  ${ai}:`), sessionId);
      }
    }

    // Show task history
    if (session.sharedContext.taskHistory.length > 0) {
      console.log(chalk.cyan('\nTask history:'));
      for (const task of session.sharedContext.taskHistory.slice(-5)) {
        const icon = task.status === 'completed' ? '✓' : task.status === 'failed' ? '✗' : '○';
        console.log(chalk.dim(`  ${icon} [${task.assignedAI}] ${task.description}`));
      }
    }
  } catch (error) {
    console.error(chalk.red('Failed to resume session:'), error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Sync all AI sessions
 */
export async function syncSessions(): Promise<void> {
  const sessionManager = new SessionManager();

  try {
    const results = await sessionManager.syncAllSessions();

    console.log(chalk.green('✓ Sessions synced'));
    console.log(chalk.dim(`  Active sessions: ${results.size}`));

    for (const [id, result] of results) {
      console.log(chalk.dim(`\n  ${id.substring(0, 8)}...`));
      for (const [ai, sessionId] of Object.entries(result.aiSessions)) {
        if (sessionId) {
          console.log(chalk.dim(`    ${ai}: ${sessionId.substring(0, 8)}...`));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red('Failed to sync sessions:'), error instanceof Error ? error.message : 'Unknown error');
  }
}
