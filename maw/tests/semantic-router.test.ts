import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTaskForRouting, AI_ROUTING_PATTERNS } from '../src/core/semantic-router.js';

describe('analyzeTaskForRouting', () => {
  it('routes backend/algorithm tasks to codex', () => {
    const result = analyzeTaskForRouting('optimize the database query algorithm');
    assert.strictEqual(result.ai, 'codex');
    assert.ok(result.confidence > 0.5);
  });

  it('routes frontend/UI tasks to gemini', () => {
    const result = analyzeTaskForRouting('build a React UI component with CSS styling and HTML layout');
    assert.strictEqual(result.ai, 'gemini');
    assert.ok(result.confidence > 0);
  });

  it('routes planning/architecture tasks to claude', () => {
    const result = analyzeTaskForRouting('plan the system architecture and security audit');
    assert.strictEqual(result.ai, 'claude');
    assert.ok(result.confidence > 0.5);
  });

  it('defaults to claude for ambiguous tasks', () => {
    const result = analyzeTaskForRouting('do something');
    assert.strictEqual(result.ai, 'claude');
    assert.strictEqual(result.confidence, 0.5);
    assert.deepStrictEqual(result.reasons, []);
  });

  it('returns matched keywords as reasons', () => {
    const result = analyzeTaskForRouting('fix the backend API server');
    assert.strictEqual(result.ai, 'codex');
    assert.ok(result.reasons.length > 0);
    assert.ok(result.reasons.some(r => /backend|api|server|fix/i.test(r)));
  });

  it('handles case-insensitive matching', () => {
    const result = analyzeTaskForRouting('OPTIMIZE the DATABASE performance');
    assert.strictEqual(result.ai, 'codex');
  });

  it('handles empty input', () => {
    const result = analyzeTaskForRouting('');
    assert.strictEqual(result.ai, 'claude');
    assert.strictEqual(result.confidence, 0.5);
  });
});

describe('AI_ROUTING_PATTERNS', () => {
  it('defines patterns for all three AIs', () => {
    assert.ok('codex' in AI_ROUTING_PATTERNS);
    assert.ok('gemini' in AI_ROUTING_PATTERNS);
    assert.ok('claude' in AI_ROUTING_PATTERNS);
  });

  it('each AI has keywords and strengths', () => {
    for (const [, config] of Object.entries(AI_ROUTING_PATTERNS)) {
      assert.ok(config.keywords.length > 0);
      assert.ok(config.strength.length > 0);
    }
  });
});
