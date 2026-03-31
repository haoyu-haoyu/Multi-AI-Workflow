import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTaskForRouting,
  AI_ROUTING_PATTERNS,
  AI_PROFILES,
  estimateTaskDifficulty,
  buildCascadePlan,
} from '../src/core/semantic-router.js';

describe('analyzeTaskForRouting (v2 weighted)', () => {
  it('routes backend/algorithm tasks to codex', () => {
    const result = analyzeTaskForRouting('optimize the database query algorithm');
    assert.strictEqual(result.ai, 'codex');
    assert.ok(result.confidence > 0.3);
  });

  it('routes frontend/UI tasks to gemini', () => {
    const result = analyzeTaskForRouting('build a React UI component with CSS styling and HTML layout');
    assert.strictEqual(result.ai, 'gemini');
    assert.ok(result.confidence > 0);
  });

  it('routes planning/architecture tasks to claude', () => {
    const result = analyzeTaskForRouting('plan the system architecture and security audit');
    assert.strictEqual(result.ai, 'claude');
    assert.ok(result.confidence > 0.3);
  });

  it('defaults to claude for ambiguous tasks', () => {
    const result = analyzeTaskForRouting('do something');
    assert.strictEqual(result.ai, 'claude');
    assert.strictEqual(result.confidence, 0.5);
    assert.deepStrictEqual(result.reasons, ['ambiguous-task']);
  });

  it('returns matched keywords as reasons', () => {
    const result = analyzeTaskForRouting('fix the backend API server');
    assert.strictEqual(result.ai, 'codex');
    assert.ok(result.reasons.length > 0);
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

  it('returns full ranking', () => {
    const result = analyzeTaskForRouting('optimize the database query algorithm');
    assert.ok(result.ranking);
    assert.strictEqual(result.ranking.length, 3);
    assert.strictEqual(result.ranking[0].ai, 'codex');
  });

  it('weighted scoring prevents single low-weight match from routing', () => {
    // "code" has weight 0.5 for codex - not enough to override threshold
    const result = analyzeTaskForRouting('write some code');
    assert.strictEqual(result.ai, 'claude'); // should default to claude (below threshold)
  });
});

describe('AI_ROUTING_PATTERNS (legacy compat)', () => {
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

describe('AI_PROFILES', () => {
  it('defines profiles with weighted keywords', () => {
    for (const [ai, profile] of Object.entries(AI_PROFILES)) {
      assert.ok(profile.keywords.length > 0, `${ai} should have keywords`);
      assert.ok(profile.strengths.length > 0, `${ai} should have strengths`);
      assert.ok(profile.cost, `${ai} should have cost tier`);
      assert.ok(typeof profile.cascadeOrder === 'number', `${ai} should have cascade order`);
    }
  });

  it('has different cascade orders', () => {
    const orders = Object.values(AI_PROFILES).map(p => p.cascadeOrder);
    assert.strictEqual(new Set(orders).size, orders.length, 'cascade orders should be unique');
  });
});

describe('estimateTaskDifficulty', () => {
  it('rates simple tasks as simple', () => {
    const result = estimateTaskDifficulty('fix typo in README');
    assert.strictEqual(result.difficulty, 'simple');
    assert.strictEqual(result.recommendedWorkflow, 'lite');
  });

  it('rates medium tasks as medium', () => {
    const result = estimateTaskDifficulty(
      'add a new API endpoint for user authentication with validation and also update the database schema ' +
      'plus write integration tests and additionally handle error cases for the concurrent async operations'
    );
    assert.strictEqual(result.difficulty, 'medium');
    assert.strictEqual(result.recommendedWorkflow, 'plan');
  });

  it('rates complex tasks as complex', () => {
    const result = estimateTaskDifficulty(
      'redesign the entire payment system with multi-step checkout, parallel processing, ' +
      'security audit, and end-to-end testing across auth.ts, payment.ts, checkout.tsx'
    );
    assert.strictEqual(result.difficulty, 'complex');
    assert.strictEqual(result.recommendedWorkflow, 'five-phase');
  });

  it('returns signals explaining the rating', () => {
    const result = estimateTaskDifficulty('redesign the architecture');
    assert.ok(result.signals.length > 0);
  });
});

describe('buildCascadePlan', () => {
  it('returns ordered cascade steps', () => {
    const plan = buildCascadePlan('optimize the backend API performance');
    assert.ok(plan.length > 0);
    // Should always end with Claude as final escalation
    assert.strictEqual(plan[plan.length - 1].ai, 'claude');
  });

  it('cheapest first for ambiguous tasks', () => {
    const plan = buildCascadePlan('do something with the code');
    assert.ok(plan.length > 0);
  });
});
