/**
 * Bridge Pool — keeps Python bridge processes alive for reuse.
 *
 * Instead of spawning a new process per request (300-500ms overhead each),
 * the pool starts bridges in --daemon mode and communicates via stdin/stdout
 * JSON lines. Process is lazily started on first request and reused until
 * explicitly closed or the Node process exits.
 *
 * Security: all prompts are passed via stdin JSON, never as CLI arguments.
 * This eliminates shell metacharacter injection (e.g. $(cmd), `cmd`, ; rm -rf /).
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface BridgeRequest {
  prompt: string;
  cd: string;
  sandbox?: string;
  session_id?: string;
  return_all_messages?: boolean;
  image?: string[];
  model?: string;
  yolo?: boolean;
  profile?: string;
  skip_git_repo_check?: boolean;
  [key: string]: unknown;
}

export interface BridgeResponse {
  success: boolean;
  SESSION_ID?: string;
  agent_messages?: string;
  error?: string;
  all_messages?: unknown[];
}

interface PendingRequest {
  resolve: (value: BridgeResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

class DaemonBridge {
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private queue: PendingRequest[] = [];
  private starting = false;
  private dead = false;

  constructor(
    private readonly bridgePath: string,
    private readonly requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  async send(request: BridgeRequest): Promise<BridgeResponse> {
    if (this.dead) {
      throw new Error(`Bridge ${this.bridgePath} has been shut down`);
    }

    await this.ensureStarted();

    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex(p => p.resolve === resolve);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error(`Bridge request timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);

      this.queue.push({ resolve, reject, timer });

      const line = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(line);
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.process && !this.dead) return;
    if (this.starting) {
      await new Promise<void>(resolve => {
        const check = setInterval(() => {
          if (!this.starting) { clearInterval(check); resolve(); }
        }, 50);
      });
      return;
    }

    this.starting = true;
    try {
      this.process = spawn('python3', [this.bridgePath, '--daemon'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      this.process.on('exit', () => {
        this.dead = true;
        for (const pending of this.queue) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Bridge process exited unexpectedly'));
        }
        this.queue = [];
      });

      this.readline = createInterface({ input: this.process.stdout! });
      this.readline.on('line', (line: string) => {
        const pending = this.queue.shift();
        if (!pending) return;
        clearTimeout(pending.timer);
        try {
          pending.resolve(JSON.parse(line));
        } catch {
          pending.reject(new Error(`Invalid JSON from bridge: ${line.slice(0, 200)}`));
        }
      });
    } finally {
      this.starting = false;
    }
  }

  close(): void {
    this.dead = true;
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }
    if (this.process) {
      this.process.stdin?.end();
      this.process.kill('SIGTERM');
      this.process = null;
    }
    for (const pending of this.queue) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bridge pool closed'));
    }
    this.queue = [];
  }
}

/**
 * Singleton pool that manages daemon bridge instances keyed by AI name.
 */
export class BridgePool {
  private bridges = new Map<string, DaemonBridge>();

  private static instance: BridgePool | null = null;

  static getInstance(): BridgePool {
    if (!BridgePool.instance) {
      BridgePool.instance = new BridgePool();
      process.on('exit', () => BridgePool.instance?.closeAll());
    }
    return BridgePool.instance;
  }

  private resolveBridgePath(ai: string): string | null {
    const home = process.env.HOME || homedir();
    const skillPaths: Record<string, string> = {
      codex: join(home, '.maw/skills/collaborating-with-codex/scripts/codex_bridge.py'),
      gemini: join(home, '.maw/skills/collaborating-with-gemini/scripts/gemini_bridge.py'),
    };

    const primary = skillPaths[ai];
    if (primary && existsSync(primary)) return primary;

    // Fallback: try bridges package
    const fallbacks = [
      join(home, '.local/lib/python3.11/site-packages/maw_bridges'),
      join(home, '.local/lib/python3.12/site-packages/maw_bridges'),
      join(home, '.local/lib/python3.13/site-packages/maw_bridges'),
    ];
    const bridgeFile = ai === 'codex' ? 'codex_bridge.py' : 'gemini_bridge.py';
    for (const base of fallbacks) {
      const p = join(base, bridgeFile);
      if (existsSync(p)) return p;
    }

    return null;
  }

  async send(ai: string, request: BridgeRequest): Promise<BridgeResponse> {
    let bridge = this.bridges.get(ai);
    if (!bridge) {
      const bridgePath = this.resolveBridgePath(ai);
      if (!bridgePath) {
        throw new Error(`Bridge not found for ${ai}. Run: pip install -e bridges/`);
      }
      bridge = new DaemonBridge(bridgePath);
      this.bridges.set(ai, bridge);
    }

    try {
      return await bridge.send(request);
    } catch (error) {
      // If the daemon died, remove it so next call spawns a fresh one
      this.bridges.delete(ai);
      throw error;
    }
  }

  close(ai: string): void {
    const bridge = this.bridges.get(ai);
    if (bridge) {
      bridge.close();
      this.bridges.delete(ai);
    }
  }

  closeAll(): void {
    for (const [, bridge] of this.bridges) {
      bridge.close();
    }
    this.bridges.clear();
  }

  /**
   * One-shot execution via --stdin mode (no daemon, no process reuse).
   * Spawns a new process, pipes JSON request via stdin, reads JSON response.
   * Use this when you only need a single call and don't want daemon overhead.
   *
   * This is the secure alternative to passing --PROMPT via CLI arguments.
   */
  static async sendOneShot(
    ai: string,
    request: BridgeRequest,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<BridgeResponse> {
    const pool = new BridgePool();
    const bridgePath = pool.resolveBridgePath(ai);
    if (!bridgePath) {
      throw new Error(`Bridge not found for ${ai}. Run: pip install -e bridges/`);
    }

    return new Promise<BridgeResponse>((resolve, reject) => {
      const proc = spawn('python3', [bridgePath, '--stdin'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Bridge --stdin timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      let stdout = '';
      proc.stdout!.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.on('close', () => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`Invalid JSON from bridge --stdin: ${stdout.slice(0, 300)}`));
        }
      });
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.stdin!.write(JSON.stringify(request));
      proc.stdin!.end();
    });
  }
}
