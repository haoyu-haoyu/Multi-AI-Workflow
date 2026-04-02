import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SkillRegistry, type SkillManifest } from '../src/core/skill-registry.js';

function createBaseSkill(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    name: 'collaborating-with-codex',
    version: '1.0.0',
    description: 'Collaborate with Codex',
    type: 'ai-bridge',
    path: '/tmp/collaborating-with-codex',
    bridge: {
      targetAI: 'codex',
      scriptPath: '/tmp/collaborating-with-codex/scripts/codex_bridge.py',
      supportsSession: true,
    },
    runtime: {
      language: 'python',
      entryPoint: 'scripts/codex_bridge.py',
    },
    security: {
      defaultSandbox: 'workspace-write',
      requiredPermissions: ['workspace.write'],
    },
    triggers: ['code', 'implementation'],
    enabled: true,
    ...overrides,
  };
}

describe('SkillRegistry capabilities', () => {
  it('derives a fallback capability from a registered skill', () => {
    const registry = new SkillRegistry(process.cwd());
    registry.register(createBaseSkill());

    const capabilities = registry.listCapabilities();

    assert.strictEqual(capabilities.length, 1);
    assert.strictEqual(capabilities[0]?.id, 'skill.collaborating-with-codex');
    assert.strictEqual(capabilities[0]?.provider, 'codex');
    assert.strictEqual(capabilities[0]?.security.defaultSandbox, 'workspace-write');
  });

  it('uses explicit capability declarations when provided', () => {
    const registry = new SkillRegistry(process.cwd());
    registry.register(
      createBaseSkill({
        name: 'review-skill',
        capabilities: [
          {
            id: 'skill.review',
            name: 'review',
            description: 'Review diffs',
            provider: 'claude',
            entryPoint: 'scripts/review.py',
          },
        ],
      }),
    );

    const capability = registry.buildCapabilityRegistry().get('skill.review');

    assert.ok(capability);
    assert.strictEqual(capability?.provider, 'claude');
    assert.strictEqual(capability?.entryPoint, 'scripts/review.py');
  });
});
