import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createConfiguredProviderRegistry } from '../src/providers/provider-registry.js';
import { loadConfig } from '../src/config/loader.js';

describe('ProviderRegistry', () => {
  it('registers configured providers and exposes them by name', () => {
    const config = structuredClone(loadConfig());
    const registry = createConfiguredProviderRegistry(config);

    assert.ok(registry.has('claude'));
    assert.ok(registry.has('codex'));
    assert.ok(registry.has('gemini'));
    assert.deepStrictEqual(registry.names(), ['claude', 'codex', 'gemini']);
  });

  it('skips disabled providers from config', () => {
    const config = structuredClone(loadConfig());
    config.ai.codex.enabled = false;
    config.ai.gemini.enabled = false;

    const registry = createConfiguredProviderRegistry(config);

    assert.deepStrictEqual(registry.names(), ['claude']);
    assert.strictEqual(registry.has('codex'), false);
    assert.strictEqual(registry.has('gemini'), false);
  });
});
