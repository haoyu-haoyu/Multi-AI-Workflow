import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry } from '../src/capabilities/capability-registry.js';
import { getBuiltinCapabilities } from '../src/capabilities/builtin-capabilities.js';
import { resolvePhaseExecution } from '../src/capabilities/capability-resolver.js';
import { ProviderRegistry } from '../src/providers/provider-registry.js';
import {
  BaseAIAdapter,
  type AIFeature,
  type AIExecutionOptions,
  type AIExecutionResult,
  type StreamChunk,
} from '../src/adapters/base-adapter.js';

class FakeAdapter extends BaseAIAdapter {
  readonly supportedFeatures: AIFeature[] = ['multi-turn'];

  constructor(name: string) {
    super({ name, enabled: true });
  }

  get name(): string {
    return this.config.name;
  }

  async execute(_options: AIExecutionOptions): Promise<AIExecutionResult> {
    return {
      success: true,
      content: this.name,
      metadata: {
        model: this.name,
        executionTime: 1,
        aiType: this.name,
      },
    };
  }

  async *stream(
    options: AIExecutionOptions,
  ): AsyncGenerator<StreamChunk, AIExecutionResult, unknown> {
    const result = await this.execute(options);
    yield { type: 'content', content: result.content };
    return result;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

describe('capability resolver', () => {
  function createRegistries(): { capabilities: CapabilityRegistry; providers: ProviderRegistry } {
    const capabilities = new CapabilityRegistry();
    capabilities.registerMany(getBuiltinCapabilities());

    const providers = new ProviderRegistry();
    providers.register(new FakeAdapter('claude'));
    providers.register(new FakeAdapter('codex'));
    providers.register(new FakeAdapter('gemini'));

    return { capabilities, providers };
  }

  it('resolves explicit capability id before assignedAI compatibility', () => {
    const { capabilities, providers } = createRegistries();

    const resolved = resolvePhaseExecution(
      {
        id: 'analysis',
        name: 'Analysis',
        type: 'delegation',
        capabilityId: 'analyze.multimodal',
        assignedAI: 'codex',
      },
      providers,
      capabilities,
    );

    assert.strictEqual(resolved.providerName, 'gemini');
    assert.strictEqual(resolved.capability?.id, 'analyze.multimodal');
  });

  it('falls back to assignedAI through builtin compatibility mapping', () => {
    const { capabilities, providers } = createRegistries();

    const resolved = resolvePhaseExecution(
      {
        id: 'impl',
        name: 'Implement',
        type: 'delegation',
        assignedAI: 'codex',
      },
      providers,
      capabilities,
    );

    assert.strictEqual(resolved.providerName, 'codex');
    assert.strictEqual(resolved.capability?.id, 'implement.code');
  });

  it('uses fallback providers when preferred providers are unavailable', () => {
    const capabilities = new CapabilityRegistry();
    capabilities.registerMany(getBuiltinCapabilities());

    const providers = new ProviderRegistry();
    providers.register(new FakeAdapter('claude'));

    const resolved = resolvePhaseExecution(
      {
        id: 'review',
        name: 'Review',
        type: 'review',
        capabilityId: 'review.changes',
        preferredProviders: ['codex'],
        fallbackProviders: ['claude'],
      },
      providers,
      capabilities,
    );

    assert.strictEqual(resolved.providerName, 'claude');
  });
});
