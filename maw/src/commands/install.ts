/**
 * Install Command
 */

import chalk from 'chalk';
import { existsSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createDefaultConfig } from '../config/loader.js';

interface InstallOptions {
  mode: string;
  withCodex?: boolean;
  withGemini?: boolean;
}

export async function install(options: InstallOptions): Promise<void> {
  const isGlobal = options.mode === 'Global';
  const targetBase = isGlobal
    ? join(process.env.HOME || homedir(), '.maw')
    : join(process.cwd(), '.maw');

  console.log(chalk.cyan(`Installing MAW (${options.mode} mode)...`));
  console.log(chalk.dim(`Target: ${targetBase}`));

  // Create directories
  const dirs = ['skills', 'config', 'workflows', 'agents'];
  for (const dir of dirs) {
    const dirPath = join(targetBase, dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      console.log(chalk.dim(`  Created: ${dir}/`));
    }
  }

  // Create default config
  createDefaultConfig(isGlobal ? process.env.HOME || homedir() : process.cwd());
  console.log(chalk.dim('  Created: config.json'));

  // Install AI bridge skills if requested
  if (options.withCodex) {
    console.log(chalk.dim('  Installing collaborating-with-codex skill...'));
    // Note: Would copy from bundled skills or download from GitHub
    console.log(chalk.yellow('    Codex skill requires manual installation from GuDaStudio/skills'));
  }

  if (options.withGemini) {
    console.log(chalk.dim('  Installing collaborating-with-gemini skill...'));
    console.log(chalk.yellow('    Gemini skill requires manual installation from GuDaStudio/skills'));
  }

  console.log(chalk.green('\n✓ MAW installed successfully'));
  console.log(chalk.dim('\nNext steps:'));
  console.log(chalk.dim('  1. Configure AI credentials: maw config set ai.codex.apiKey <key>'));
  console.log(chalk.dim('  2. Install AI skills: maw skill install <path-to-skills>'));
  console.log(chalk.dim('  3. Start a workflow: maw workflow:plan "your task"'));
}
