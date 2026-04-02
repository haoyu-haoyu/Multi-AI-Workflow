import { v4 as uuidv4 } from 'uuid';
import type { BaseAIAdapter } from '../adapters/base-adapter.js';
import type { MAWConfig } from '../config/loader.js';
import {
  SessionManager,
  type SessionManagerOptions,
  type UnifiedSession,
} from '../core/session-manager.js';
import {
  ProviderRegistry,
  createConfiguredProviderRegistry,
} from '../providers/provider-registry.js';
import type { DelegateRunRequest, DelegateRunResult } from './run-types.js';

export class MAWRuntime {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly projectRoot: string = process.cwd(),
    private readonly providerRegistry: ProviderRegistry = new ProviderRegistry(),
  ) {}

  static createConfiguredRuntime(
    config: MAWConfig,
    projectRoot: string = process.cwd(),
    sessionOptions?: SessionManagerOptions,
  ): MAWRuntime {
    return new MAWRuntime(
      new SessionManager(projectRoot, sessionOptions),
      projectRoot,
      createConfiguredProviderRegistry(config),
    );
  }

  registerAdapter(adapter: BaseAIAdapter): void {
    this.providerRegistry.register(adapter);
  }

  listProviders(): string[] {
    return this.providerRegistry.names();
  }

  hasProvider(name: string): boolean {
    return this.providerRegistry.has(name);
  }

  getProvider(name: string): BaseAIAdapter | undefined {
    return this.providerRegistry.get(name);
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
