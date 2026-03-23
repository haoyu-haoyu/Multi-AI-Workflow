/**
 * Base AI Adapter
 *
 * Abstract base class for all AI model adapters.
 * Provides unified interface for Claude, Codex, Gemini, and LiteLLM.
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

export type SandboxLevel = 'read-only' | 'workspace-write' | 'danger-full-access';

/**
 * Resolve a bridge script path by checking multiple locations in order:
 * 1. Relative to the MAW package installation (works after npm install -g)
 * 2. ~/.maw/skills/<skill>/scripts/ (works after maw skill install)
 * 3. Relative to process.cwd() (works during development)
 */
function resolveBridgePath(bridgeName: string): string {
  const scriptFile = `${bridgeName}_bridge.py`;
  const skillDir = bridgeName === 'codex'
    ? 'collaborating-with-codex'
    : 'collaborating-with-gemini';

  const candidates = [
    // 1. Relative to this package (npm global install)
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bridges', 'src', 'maw_bridges', scriptFile),
    // 2. User skill directory
    join(homedir(), '.maw', 'skills', skillDir, 'scripts', scriptFile),
    // 3. Current working directory (development)
    join(process.cwd(), 'bridges', 'src', 'maw_bridges', scriptFile),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback to cwd-relative (original behavior)
  return candidates[2];
}

export interface AIExecutionOptions {
  /** Task prompt/instruction */
  prompt: string;

  /** Working directory */
  workingDir: string;

  /** Sandbox security level */
  sandbox: SandboxLevel;

  /** Continue existing session (SESSION_ID from skills) */
  sessionId?: string;

  /** Image attachments for visual context */
  images?: string[];

  /** Additional context */
  context?: {
    relevantFiles?: string[];
    codebaseQuery?: string;
  };

  /** Enable streaming output */
  stream?: boolean;

  /** Execution timeout in ms */
  timeout?: number;

  /** Model override */
  model?: string;
}

export interface Artifact {
  type: 'code' | 'diff' | 'file' | 'documentation';
  path?: string;
  content: string;
  language?: string;
}

export interface AIExecutionResult {
  /** Whether execution succeeded */
  success: boolean;

  /** AI native session ID (SESSION_ID from skills) */
  sessionId?: string;

  /** Main output content (agent_messages from skills) */
  content: string;

  /** Generated artifacts (code, diffs, etc.) */
  artifacts?: Artifact[];

  /** Execution metadata */
  metadata: {
    model: string;
    tokensUsed?: number;
    executionTime: number;
    aiType: string;
  };

  /** Error information if failed */
  error?: string;
}

export interface StreamChunk {
  type: 'content' | 'artifact' | 'status' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
}

export type AIFeature =
  | 'code-generation'
  | 'debugging'
  | 'code-review'
  | 'multi-turn'
  | 'image-input'
  | 'streaming'
  | 'function-calling';

export interface AIAdapterConfig {
  name: string;
  enabled: boolean;
  cliPath?: string;
  apiKey?: string;
  model?: string;
  timeout?: number;
  customOptions?: Record<string, unknown>;
}

/**
 * Abstract base class for AI adapters
 */
export abstract class BaseAIAdapter {
  /** Unique adapter name */
  abstract readonly name: string;

  /** Supported features */
  abstract readonly supportedFeatures: AIFeature[];

  /** Adapter configuration */
  protected config: AIAdapterConfig;

  constructor(config: AIAdapterConfig) {
    this.config = config;
  }

  /**
   * Execute task with AI model
   * @param options Execution options
   * @returns Execution result with SESSION_ID for multi-turn support
   */
  abstract execute(options: AIExecutionOptions): Promise<AIExecutionResult>;

  /**
   * Stream execution for real-time output
   * @param options Execution options
   * @yields Stream chunks
   * @returns Final execution result
   */
  abstract stream(
    options: AIExecutionOptions
  ): AsyncGenerator<StreamChunk, AIExecutionResult, unknown>;

  /**
   * Check if adapter is available and configured
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Get adapter configuration
   */
  getConfig(): AIAdapterConfig {
    return this.config;
  }

  /**
   * Check if feature is supported
   */
  supportsFeature(feature: AIFeature): boolean {
    return this.supportedFeatures.includes(feature);
  }

  /**
   * Validate execution options
   */
  protected validateOptions(options: AIExecutionOptions): void {
    if (!options.prompt || options.prompt.trim() === '') {
      throw new Error('Prompt is required');
    }
    if (!options.workingDir) {
      throw new Error('Working directory is required');
    }
  }

  /**
   * Build execution result
   */
  protected buildResult(
    success: boolean,
    content: string,
    sessionId?: string,
    artifacts?: Artifact[],
    executionTime: number = 0,
    error?: string
  ): AIExecutionResult {
    return {
      success,
      sessionId,
      content,
      artifacts,
      metadata: {
        model: this.config.model || this.name,
        executionTime,
        aiType: this.name,
      },
      error,
    };
  }
}

/**
 * Claude Adapter - Native integration
 */
export class ClaudeAdapter extends BaseAIAdapter {
  readonly name = 'claude';
  readonly supportedFeatures: AIFeature[] = [
    'code-generation',
    'debugging',
    'code-review',
    'multi-turn',
    'image-input',
    'streaming',
    'function-calling',
  ];

  async execute(options: AIExecutionOptions): Promise<AIExecutionResult> {
    this.validateOptions(options);
    const startTime = Date.now();

    // Claude is the native model - execution happens through Claude Code itself
    // This adapter is primarily for consistency in the multi-AI architecture
    return this.buildResult(
      true,
      `[Claude Native] Task delegated: ${options.prompt.substring(0, 100)}...`,
      options.sessionId,
      undefined,
      Date.now() - startTime
    );
  }

  async *stream(
    options: AIExecutionOptions
  ): AsyncGenerator<StreamChunk, AIExecutionResult, unknown> {
    this.validateOptions(options);
    const startTime = Date.now();

    yield {
      type: 'status',
      content: 'Claude processing...',
    };

    yield {
      type: 'content',
      content: `Processing: ${options.prompt}`,
    };

    return this.buildResult(
      true,
      'Claude streaming complete',
      options.sessionId,
      undefined,
      Date.now() - startTime
    );
  }

  async isAvailable(): Promise<boolean> {
    // Claude is always available as the native model
    return true;
  }
}

/**
 * Codex Adapter - Bridges to Python codex_bridge.py
 */
export class CodexAdapter extends BaseAIAdapter {
  readonly name = 'codex';
  readonly supportedFeatures: AIFeature[] = [
    'code-generation',
    'debugging',
    'multi-turn',
    'image-input',
  ];

  private bridgePath: string;

  constructor(config: AIAdapterConfig) {
    super(config);
    this.bridgePath = config.cliPath || 'python';
  }

  async execute(options: AIExecutionOptions): Promise<AIExecutionResult> {
    this.validateOptions(options);
    const startTime = Date.now();

    try {
      const result = await this.callBridge(options);
      return this.buildResult(
        result.success,
        result.agent_messages || '',
        result.SESSION_ID,
        this.parseArtifacts(result.agent_messages || ''),
        Date.now() - startTime,
        result.error
      );
    } catch (error) {
      return this.buildResult(
        false,
        '',
        undefined,
        undefined,
        Date.now() - startTime,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async *stream(
    options: AIExecutionOptions
  ): AsyncGenerator<StreamChunk, AIExecutionResult, unknown> {
    this.validateOptions(options);
    const startTime = Date.now();

    yield {
      type: 'status',
      content: 'Connecting to Codex CLI...',
    };

    // For now, fall back to non-streaming
    const result = await this.execute(options);

    yield {
      type: 'content',
      content: result.content,
    };

    return result;
  }

  async isAvailable(): Promise<boolean> {
    // Check if Codex CLI is available
    try {
      const { execSync } = await import('child_process');
      execSync('codex --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private async callBridge(options: AIExecutionOptions): Promise<BridgeResult> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const bridgeScript = resolveBridgePath('codex');

      const args = [
        bridgeScript,
        '--PROMPT', options.prompt,
        '--cd', options.workingDir,
        '--sandbox', options.sandbox,
      ];

      if (options.sessionId) {
        args.push('--SESSION_ID', options.sessionId);
      }

      if (options.images && options.images.length > 0) {
        args.push('--image', options.images[0]);
      }

      const proc = spawn(this.bridgePath, args, {
        cwd: options.workingDir,
        env: process.env,
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
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch {
            resolve({
              success: false,
              error: 'Failed to parse bridge response',
              agent_messages: stdout,
            });
          }
        } else {
          resolve({
            success: false,
            error: stderr || `Bridge exited with code ${code}`,
          });
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  private parseArtifacts(content: string): Artifact[] | undefined {
    // Parse code blocks and diffs from content
    const artifacts: Artifact[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      artifacts.push({
        type: 'code',
        content: match[2],
        language: match[1] || 'text',
      });
    }

    return artifacts.length > 0 ? artifacts : undefined;
  }
}

/**
 * Gemini Adapter - Bridges to Python gemini_bridge.py
 */
export class GeminiAdapter extends BaseAIAdapter {
  readonly name = 'gemini';
  readonly supportedFeatures: AIFeature[] = [
    'code-generation',
    'debugging',
    'code-review',
    'multi-turn',
    'streaming',
  ];

  private bridgePath: string;

  constructor(config: AIAdapterConfig) {
    super(config);
    this.bridgePath = config.cliPath || 'python';
  }

  async execute(options: AIExecutionOptions): Promise<AIExecutionResult> {
    this.validateOptions(options);
    const startTime = Date.now();

    try {
      const result = await this.callBridge(options);
      return this.buildResult(
        result.success,
        result.agent_messages || '',
        result.SESSION_ID,
        undefined,
        Date.now() - startTime,
        result.error
      );
    } catch (error) {
      return this.buildResult(
        false,
        '',
        undefined,
        undefined,
        Date.now() - startTime,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async *stream(
    options: AIExecutionOptions
  ): AsyncGenerator<StreamChunk, AIExecutionResult, unknown> {
    this.validateOptions(options);
    const startTime = Date.now();

    yield {
      type: 'status',
      content: 'Connecting to Gemini CLI...',
    };

    const result = await this.execute(options);

    yield {
      type: 'content',
      content: result.content,
    };

    return result;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process');
      execSync('gemini --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private async callBridge(options: AIExecutionOptions): Promise<BridgeResult> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const bridgeScript = resolveBridgePath('gemini');

      const args = [
        bridgeScript,
        '--PROMPT', options.prompt,
        '--cd', options.workingDir,
      ];

      if (options.sessionId) {
        args.push('--SESSION_ID', options.sessionId);
      }

      const proc = spawn(this.bridgePath, args, {
        cwd: options.workingDir,
        env: process.env,
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
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch {
            resolve({
              success: false,
              error: 'Failed to parse bridge response',
              agent_messages: stdout,
            });
          }
        } else {
          resolve({
            success: false,
            error: stderr || `Bridge exited with code ${code}`,
          });
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}

interface BridgeResult {
  success: boolean;
  SESSION_ID?: string;
  agent_messages?: string;
  error?: string;
  all_messages?: unknown[];
}

export default BaseAIAdapter;
