import { v4 as uuidv4 } from 'uuid';
import type {
  AIAdapterConfig,
  AIExecutionResult,
  BaseAIAdapter,
} from '../adapters/base-adapter.js';
import {
  ClaudeAdapter,
  CodexAdapter,
  GeminiAdapter,
} from '../adapters/base-adapter.js';
import type { MAWConfig } from '../config/loader.js';
import {
  SessionManager,
  type SessionManagerOptions,
  type UnifiedSession,
} from '../core/session-manager.js';
import type { DelegateRunRequest, DelegateRunResult } from './run-types.js';

type RuntimeAI = 'claude' | 'codex' | 'gemini';

function createAdapterConfig(
  name: RuntimeAI,
  overrides: Partial<AIAdapterConfig> = {},
): AIAdapterConfig {
  return {
    name,
    enabled: true,
    ...overrides,
  };
}

export class MAWRuntime {
  private readonly adapters = new Map<string, BaseAIAdapter>();

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly projectRoot: string = process.cwd(),
  ) {}

  static createConfiguredRuntime(
    config: MAWConfig,
    projectRoot: string = process.cwd(),
    sessionOptions?: SessionManagerOptions,
  ): MAWRuntime {
    const runtime = new MAWRuntime(new SessionManager(projectRoot, sessionOptions), projectRoot);
    runtime.registerAdapter(new ClaudeAdapter(createAdapterConfig('claude')));

    if (config.ai.codex.enabled) {
      runtime.registerAdapter(
        new CodexAdapter(createAdapterConfig('codex', { cliPath: config.ai.codex.cliPath })),
      );
    }

    if (config.ai.gemini.enabled) {
      runtime.registerAdapter(
        new GeminiAdapter(createAdapterConfig('gemini', { cliPath: config.ai.gemini.cliPath })),
      );
    }

    return runtime;
  }

  registerAdapter(adapter: BaseAIAdapter): void {
    this.adapters.set(adapter.name.toLowerCase(), adapter);
  }

  listProviders(): string[] {
    return Array.from(this.adapters.keys()).sort();
  }

  hasProvider(name: string): boolean {
    return this.adapters.has(name.toLowerCase());
  }

  getProvider(name: string): BaseAIAdapter | undefined {
    return this.adapters.get(name.toLowerCase());
  }

  async delegate(request: DelegateRunRequest): Promise<DelegateRunResult> {
    const provider = request.provider.toLowerCase();
    const adapter = this.getProvider(provider);

    if (!adapter) {
      throw new Error(`Unknown provider: ${request.provider}`);
    }

    const available = await adapter.isAvailable();
    if (!available) {
      throw new Error(`${provider} CLI is not available`);
    }

    const session = request.sessionId
      ? await this.sessionManager.resumeSession(request.sessionId)
      : await this.sessionManager.createSession({
          name: `delegate-${provider}-${Date.now()}`,
          workflowLevel: 'delegate',
          projectRoot: request.projectRoot || this.projectRoot,
        });

    const execution = await adapter.execute({
      prompt: request.task,
      workingDir: request.projectRoot || this.projectRoot,
      sandbox: request.policy.sandbox,
      sessionId: session.aiSessions[provider as keyof typeof session.aiSessions],
      stream: request.stream,
    });

    if (execution.sessionId && this.isLinkedSessionProvider(provider)) {
      await this.sessionManager.linkExternalSession(session, provider, execution.sessionId);
    }

    this.sessionManager.addTaskRecord(session, {
      id: uuidv4(),
      description: request.task,
      assignedAI: provider,
      status: execution.success ? 'completed' : 'failed',
      result: execution.success ? execution.content : execution.error,
      timestamp: new Date(),
    });

    return {
      provider,
      session,
      execution,
    };
  }

  private isLinkedSessionProvider(provider: string): provider is keyof UnifiedSession['aiSessions'] {
    return provider === 'claude' || provider === 'codex' || provider === 'gemini' || provider === 'litellm';
  }
}
