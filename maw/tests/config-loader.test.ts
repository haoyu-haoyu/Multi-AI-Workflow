import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/loader.js';

describe('loadConfig', () => {
  it('returns a valid config object with default values', () => {
    const config = loadConfig('/tmp/nonexistent-project');
    assert.ok(config);
    assert.ok(config.ai);
    assert.ok(config.ai.codex);
    assert.ok(config.ai.gemini);
    assert.strictEqual(typeof config.ai.codex.enabled, 'boolean');
    assert.strictEqual(typeof config.ai.gemini.enabled, 'boolean');
  });

  it('is idempotent — calling twice returns equivalent configs', () => {
    const config1 = loadConfig('/tmp/nonexistent-project');
    const config2 = loadConfig('/tmp/nonexistent-project');
    // The .reverse() bug would make these different
    assert.deepStrictEqual(config1.ai.codex.enabled, config2.ai.codex.enabled);
    assert.deepStrictEqual(config1.ai.gemini.enabled, config2.ai.gemini.enabled);
  });

  it('has workflow settings', () => {
    const config = loadConfig('/tmp/nonexistent-project');
    assert.ok(config.workflow);
    assert.strictEqual(typeof config.workflow.defaultLevel, 'string');
  });
});
