import {
  ClaudeAdapter,
  CodexAdapter,
  GeminiAdapter,
  type AIAdapterConfig,
  type BaseAIAdapter,
} from '../adapters/base-adapter.js';
import type { MAWConfig } from '../config/loader.js';

type KnownProvider = 'claude' | 'codex' | 'gemini';

function createAdapterConfig(
  name: KnownProvider,
  overrides: Partial<AIAdapterConfig> = {},
): AIAdapterConfig {
  return {
    name,
    enabled: true,
    ...overrides,
  };
}

export class ProviderRegistry {
  private readonly providers = new Map<string, BaseAIAdapter>();

  register(adapter: BaseAIAdapter): void {
    this.providers.set(adapter.name.toLowerCase(), adapter);
  }

  unregister(name: string): boolean {
    return this.providers.delete(name.toLowerCase());
  }

  get(name: string): BaseAIAdapter | undefined {
    return this.providers.get(name.toLowerCase());
  }

  has(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  list(): BaseAIAdapter[] {
    return Array.from(this.providers.values());
  }

  names(): string[] {
    return Array.from(this.providers.keys()).sort();
  }
}

export function createConfiguredProviderRegistry(config: MAWConfig): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new ClaudeAdapter(createAdapterConfig('claude')));

  if (config.ai.codex.enabled) {
    registry.register(
      new CodexAdapter(createAdapterConfig('codex', { cliPath: config.ai.codex.cliPath })),
    );
  }

  if (config.ai.gemini.enabled) {
    registry.register(
      new GeminiAdapter(createAdapterConfig('gemini', { cliPath: config.ai.gemini.cliPath })),
    );
  }

  return registry;
}
