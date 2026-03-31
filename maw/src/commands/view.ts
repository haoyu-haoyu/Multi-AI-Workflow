/**
 * View Command - Dashboard Server
 *
 * Launches the MAW Dashboard web interface.
 */

import chalk from 'chalk';
import { spawn, execFile } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { platform, homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Open URL in default browser (safe — no shell interpolation)
 */
function openBrowser(url: string): void {
  const plat = platform();
  let cmd: string;
  let args: string[];

  if (plat === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (plat === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }

  execFile(cmd, args, (err) => {
    if (err) {
      console.log(chalk.dim(`\nCould not open browser automatically. Please visit:`));
      console.log(chalk.cyan(url));
    }
  });
}

/**
 * Launch the dashboard server
 */
export async function openDashboard(options: {
  port: number;
  browser: boolean;
  dataDir?: string;
}): Promise<void> {
  const port = options.port || 3000;
  const dataDir = options.dataDir || '.maw';

  // Check if dashboard module exists
  const dashboardPath = join(__dirname, '../../../dashboard');
  const distPath = join(dashboardPath, 'dist/server.js');

  // First try to use compiled version
  if (existsSync(distPath)) {
    console.log(chalk.cyan('Starting MAW Dashboard...'));

    const server = spawn('node', [distPath], {
      env: {
        ...process.env,
        MAW_DASHBOARD_PORT: String(port),
        MAW_DATA_DIR: dataDir,
      },
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let started = false;

    server.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log(output.trim());

      if (!started && output.includes('Dashboard running')) {
        started = true;
        if (options.browser) {
          setTimeout(() => openBrowser(`http://localhost:${port}`), 500);
        }
      }
    });

    server.stderr?.on('data', (data) => {
      console.error(chalk.red(data.toString().trim()));
    });

    server.on('error', (err) => {
      console.error(chalk.red(`Failed to start dashboard: ${err.message}`));
    });

    server.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.log(chalk.yellow(`Dashboard exited with code ${code}`));
      }
    });

    // Handle graceful shutdown
    const shutdown = () => {
      console.log(chalk.dim('\nShutting down dashboard...'));
      server.kill('SIGTERM');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } else {
    // Try dev mode with tsx
    const serverTsPath = join(dashboardPath, 'src/server.ts');

    if (existsSync(serverTsPath)) {
      console.log(chalk.cyan('Starting MAW Dashboard (dev mode)...'));
      console.log(chalk.dim('Tip: Run "npm run build" in dashboard/ for production mode.'));

      // Check if dashboard dependencies are installed
      const nodeModulesPath = join(dashboardPath, 'node_modules');
      if (!existsSync(nodeModulesPath)) {
        console.log(chalk.yellow('\nDashboard dependencies not installed. Run:'));
        console.log(chalk.dim(`  cd ${dashboardPath}`));
        console.log(chalk.dim('  npm install'));
        console.log(chalk.dim('\nThen run: maw view'));
        return;
      }

      const server = spawn('npx', ['tsx', serverTsPath], {
        env: {
          ...process.env,
          MAW_DASHBOARD_PORT: String(port),
          MAW_DATA_DIR: dataDir,
        },
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
      });

      let started = false;

      server.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log(output.trim());

        if (!started && output.includes('Dashboard running')) {
          started = true;
          if (options.browser) {
            setTimeout(() => openBrowser(`http://localhost:${port}`), 500);
          }
        }
      });

      server.stderr?.on('data', (data) => {
        const errOutput = data.toString();
        // Filter out tsx compilation messages
        if (!errOutput.includes('[tsx]')) {
          console.error(chalk.dim(errOutput.trim()));
        }
      });

      server.on('error', (err) => {
        console.error(chalk.red(`Failed to start dashboard: ${err.message}`));
        showManualInstructions(port, dashboardPath);
      });

      // Handle graceful shutdown
      const shutdown = () => {
        console.log(chalk.dim('\nShutting down dashboard...'));
        server.kill('SIGTERM');
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

    } else {
      showManualInstructions(port, dashboardPath);
    }
  }
}

function showManualInstructions(port: number, dashboardPath: string): void {
  console.log(chalk.yellow('\nDashboard not built yet. To set up:'));
  console.log(chalk.dim(`
  cd ${dashboardPath}
  npm install
  npm run build

Then run:
  maw view

Or for development:
  cd ${dashboardPath}
  npm run dev
`));
  console.log(chalk.cyan(`Dashboard will be available at: http://localhost:${port}`));
}

/**
 * Show dashboard status
 */
export async function showDashboardStatus(options: { port: number }): Promise<void> {
  const port = options.port || 3000;
  const url = `http://localhost:${port}/api/health`;

  try {
    const response = await fetch(url);
    const data = await response.json() as { status: string; timestamp: string };

    if (data.status === 'ok') {
      console.log(chalk.green('Dashboard is running'));
      console.log(chalk.dim(`  URL: http://localhost:${port}`));
      console.log(chalk.dim(`  Timestamp: ${data.timestamp}`));
    }
  } catch {
    console.log(chalk.yellow('Dashboard is not running'));
    console.log(chalk.dim(`  Start with: maw view`));
  }
}
