/**
 * Bridge Commands
 *
 * The bridge service (HTTP/WebSocket server for AI coordination) is planned
 * but not yet implemented. These commands provide clear status messaging.
 *
 * For now, use the Python bridge scripts directly:
 *   python bridges/src/maw_bridges/codex_bridge.py --PROMPT "task" --cd .
 *   python bridges/src/maw_bridges/gemini_bridge.py --PROMPT "task" --cd .
 */

import chalk from 'chalk';

export async function startBridge(options: { port: string }): Promise<void> {
  console.log(chalk.yellow('⚠ Bridge service is not yet implemented.'));
  console.log();
  console.log(chalk.dim('Use the Python bridge scripts directly instead:'));
  console.log(chalk.cyan('  python bridges/src/maw_bridges/codex_bridge.py --PROMPT "task" --cd .'));
  console.log(chalk.cyan('  python bridges/src/maw_bridges/gemini_bridge.py --PROMPT "task" --cd .'));
  console.log();
  console.log(chalk.dim('Or use the CLI commands:'));
  console.log(chalk.cyan('  maw delegate codex "your task"'));
  console.log(chalk.cyan('  maw delegate gemini "your task"'));
}

export async function bridgeStatus(): Promise<void> {
  console.log(chalk.yellow('⚠ Bridge service is not yet implemented.'));
  console.log(chalk.dim('Use "maw delegate <ai> <task>" for AI delegation.'));
}

export async function stopBridge(): Promise<void> {
  console.log(chalk.yellow('⚠ Bridge service is not yet implemented.'));
}
