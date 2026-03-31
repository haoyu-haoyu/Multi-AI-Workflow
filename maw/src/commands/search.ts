/**
 * Search Commands - CodexLens Integration
 *
 * Provides code search functionality using the CodexLens Python module.
 */

import chalk from 'chalk';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

interface SearchResult {
  path: string;
  score: number;
  line_number: number;
  match_context: string;
  search_type: string;
  highlights: string[];
}

interface IndexStats {
  total_files: number;
  total_lines: number;
  total_size: number;
  languages: Record<string, number>;
  last_indexed: string | null;
}

/**
 * Run CodexLens CLI command
 */
async function runCodexLens(
  args: string[],
  cwd: string = process.cwd()
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('codex-lens', args, {
      cwd,
      env: { ...process.env },
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });

    proc.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, code: 1 });
    });
  });
}

/**
 * Check if CodexLens is installed
 */
async function checkCodexLens(): Promise<boolean> {
  const { code } = await runCodexLens(['--version']);
  return code === 0;
}

/**
 * Search code using CodexLens
 */
export async function searchCode(
  query: string,
  options: {
    mode: string;
    limit: string;
    language?: string;
    path?: string;
    indexPath?: string;
  }
): Promise<void> {
  console.log(chalk.cyan(`Searching: "${query}"`));
  console.log(chalk.dim(`Mode: ${options.mode}, Limit: ${options.limit}`));

  // Check if CodexLens is installed
  const hasCodexLens = await checkCodexLens();
  if (!hasCodexLens) {
    console.log(chalk.yellow('\nCodexLens not found. Install with:'));
    console.log(chalk.dim('  cd codex-lens && pip install -e .'));
    return;
  }

  // Check if index exists
  const indexPath = options.indexPath || '.maw/index';
  const dbPath = join(process.cwd(), indexPath, 'code.db');
  if (!existsSync(dbPath)) {
    console.log(chalk.yellow('\nNo index found. Run indexing first:'));
    console.log(chalk.dim('  maw search --index'));
    console.log(chalk.dim('  # or'));
    console.log(chalk.dim('  codex-lens index .'));
    return;
  }

  // Build search command
  const args = [
    'search',
    query,
    '--json',
    '-n', options.limit,
    '-m', options.mode,
    '-i', indexPath,
  ];

  if (options.language) {
    args.push('-l', options.language);
  }

  if (options.path) {
    args.push('-p', options.path);
  }

  const { stdout, stderr, code } = await runCodexLens(args);

  if (code !== 0) {
    console.log(chalk.red('\nSearch failed:'), stderr);
    return;
  }

  try {
    const results: SearchResult[] = JSON.parse(stdout);

    if (results.length === 0) {
      console.log(chalk.yellow('\nNo results found.'));
      return;
    }

    console.log(chalk.green(`\nFound ${results.length} results:\n`));

    results.forEach((result, i) => {
      // File path and line number
      console.log(
        chalk.cyan(`${i + 1}. ${result.path}`) +
        (result.line_number > 0 ? chalk.yellow(`:${result.line_number}`) : '') +
        chalk.dim(` (score: ${result.score.toFixed(4)})`)
      );

      // Show context
      if (result.match_context) {
        const lines = result.match_context.split('\n');
        lines.forEach((line) => {
          // Highlight the query in the output
          const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const highlighted = line.replace(
            new RegExp(escapedQuery, 'gi'),
            (match) => chalk.bgYellow.black(match)
          );
          console.log(chalk.dim('   │ ') + highlighted);
        });
      }

      console.log();
    });
  } catch (e) {
    console.log(chalk.red('\nFailed to parse search results.'));
    console.log(chalk.dim(stdout));
  }
}

/**
 * Index codebase using CodexLens
 */
export async function indexCodebase(options: {
  full: boolean;
  directory?: string;
  indexPath?: string;
}): Promise<void> {
  const directory = options.directory || '.';
  const indexPath = options.indexPath || '.maw/index';

  console.log(chalk.cyan(options.full ? 'Full reindex...' : 'Incremental index...'));
  console.log(chalk.dim(`Directory: ${directory}`));
  console.log(chalk.dim(`Index path: ${indexPath}`));

  // Check if CodexLens is installed
  const hasCodexLens = await checkCodexLens();
  if (!hasCodexLens) {
    console.log(chalk.yellow('\nCodexLens not found. Install with:'));
    console.log(chalk.dim('  cd codex-lens && pip install -e .'));
    return;
  }

  // Clear index if full reindex
  if (options.full) {
    const { code } = await runCodexLens(['clear', '-i', indexPath, '-f']);
    if (code !== 0) {
      console.log(chalk.red('Failed to clear index.'));
    }
  }

  // Run indexing
  console.log(chalk.dim('\nIndexing files...'));

  const args = ['index', directory, '-i', indexPath, '--json'];
  const { stdout, stderr, code } = await runCodexLens(args);

  if (code !== 0) {
    console.log(chalk.red('\nIndexing failed:'), stderr);
    return;
  }

  try {
    const stats: IndexStats = JSON.parse(stdout);

    console.log(chalk.green('\nIndexing complete!'));
    console.log(chalk.dim('─'.repeat(40)));
    console.log(`  Files indexed: ${chalk.cyan(stats.total_files)}`);
    console.log(`  Total lines: ${chalk.cyan(stats.total_lines.toLocaleString())}`);
    console.log(`  Total size: ${chalk.cyan(formatBytes(stats.total_size))}`);

    if (stats.languages && Object.keys(stats.languages).length > 0) {
      console.log('\n  Languages:');
      const sorted = Object.entries(stats.languages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      for (const [lang, count] of sorted) {
        console.log(`    ${chalk.dim('•')} ${lang}: ${count}`);
      }
    }
  } catch (e) {
    // Non-JSON output (likely progress messages)
    console.log(stdout);
  }
}

/**
 * Show index statistics
 */
export async function showIndexStats(options: { indexPath?: string }): Promise<void> {
  const indexPath = options.indexPath || '.maw/index';

  // Check if CodexLens is installed
  const hasCodexLens = await checkCodexLens();
  if (!hasCodexLens) {
    console.log(chalk.yellow('CodexLens not found. Install with:'));
    console.log(chalk.dim('  cd codex-lens && pip install -e .'));
    return;
  }

  const args = ['stats', '-i', indexPath, '--json'];
  const { stdout, stderr, code } = await runCodexLens(args);

  if (code !== 0) {
    console.log(chalk.yellow('No index found or error:'), stderr);
    return;
  }

  try {
    const stats: IndexStats = JSON.parse(stdout);

    console.log(chalk.cyan('\nIndex Statistics'));
    console.log(chalk.dim('─'.repeat(40)));
    console.log(`  Files indexed: ${chalk.green(stats.total_files)}`);
    console.log(`  Total lines: ${chalk.green(stats.total_lines.toLocaleString())}`);
    console.log(`  Total size: ${chalk.green(formatBytes(stats.total_size))}`);

    if (stats.last_indexed) {
      console.log(`  Last indexed: ${chalk.dim(stats.last_indexed)}`);
    }

    if (stats.languages && Object.keys(stats.languages).length > 0) {
      console.log('\n  Languages:');
      const sorted = Object.entries(stats.languages).sort((a, b) => b[1] - a[1]);

      for (const [lang, count] of sorted) {
        const bar = '█'.repeat(Math.min(20, Math.round((count / stats.total_files) * 40)));
        console.log(`    ${lang.padEnd(12)} ${bar} ${count}`);
      }
    }
  } catch (e) {
    console.log(stdout);
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
