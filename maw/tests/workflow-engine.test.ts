import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../src/core/workflow-engine.js';
import type { WorkflowPhase } from '../src/core/workflow-engine.js';

describe('computeExecutionLayers', () => {
  // Access private method via prototype for testing
  const engine = Object.create(WorkflowEngine.prototype);
  const compute = (phases: WorkflowPhase[]) =>
    engine.computeExecutionLayers(phases);

  it('puts phases with no dependencies in layer 0', () => {
    const phases: WorkflowPhase[] = [
      { id: 'a', name: 'A', type: 'delegation', assignedAI: 'codex', inputs: ['task'], outputs: ['a-out'] },
      { id: 'b', name: 'B', type: 'delegation', assignedAI: 'gemini', inputs: ['task'], outputs: ['b-out'] },
    ];
    const layers = compute(phases);
    assert.strictEqual(layers.length, 1);
    assert.strictEqual(layers[0].length, 2);
  });

  it('separates dependent phases into different layers', () => {
    const phases: WorkflowPhase[] = [
      { id: 'plan', name: 'Plan', type: 'planning', assignedAI: 'claude', inputs: ['task'], outputs: ['plan'] },
      { id: 'exec', name: 'Execute', type: 'execution', assignedAI: 'codex', inputs: ['plan'], outputs: ['result'] },
    ];
    const layers = compute(phases);
    assert.strictEqual(layers.length, 2);
    assert.strictEqual(layers[0][0].id, 'plan');
    assert.strictEqual(layers[1][0].id, 'exec');
  });

  it('groups independent phases in same layer for parallel execution', () => {
    const phases: WorkflowPhase[] = [
      { id: 'codex-analysis', name: 'Codex', type: 'delegation', assignedAI: 'codex', inputs: ['topic'], outputs: ['codex-out'] },
      { id: 'gemini-analysis', name: 'Gemini', type: 'delegation', assignedAI: 'gemini', inputs: ['topic'], outputs: ['gemini-out'] },
      { id: 'synthesize', name: 'Synth', type: 'planning', assignedAI: 'claude', inputs: ['codex-out', 'gemini-out'], outputs: ['guidance'] },
    ];
    const layers = compute(phases);
    assert.strictEqual(layers.length, 2);
    assert.strictEqual(layers[0].length, 2); // codex + gemini parallel
    assert.strictEqual(layers[1].length, 1); // synthesize after both
    assert.strictEqual(layers[1][0].id, 'synthesize');
  });

  it('handles single phase', () => {
    const phases: WorkflowPhase[] = [
      { id: 'only', name: 'Only', type: 'execution', assignedAI: 'claude', inputs: ['task'], outputs: ['result'] },
    ];
    const layers = compute(phases);
    assert.strictEqual(layers.length, 1);
    assert.strictEqual(layers[0][0].id, 'only');
  });

  it('handles empty phases array', () => {
    const layers = compute([]);
    assert.strictEqual(layers.length, 0);
  });

  it('breaks deadlocks by forcing first remaining phase', () => {
    // Phase that depends on an output no one produces
    const phases: WorkflowPhase[] = [
      { id: 'orphan', name: 'Orphan', type: 'execution', assignedAI: 'codex', inputs: ['nonexistent'], outputs: ['out'] },
    ];
    const layers = compute(phases);
    assert.strictEqual(layers.length, 1);
    assert.strictEqual(layers[0][0].id, 'orphan');
  });
});

describe('buildPhaseContext', () => {
  const engine = Object.create(WorkflowEngine.prototype);
  const build = (outputs: Record<string, string>, inputs: string[]) =>
    engine.buildPhaseContext(outputs, inputs);

  it('returns empty string when no inputs match', () => {
    assert.strictEqual(build({}, ['plan']), '');
    assert.strictEqual(build({ other: 'data' }, ['plan']), '');
  });

  it('returns formatted context for matching inputs', () => {
    const result = build({ plan: 'Step 1: do X', analysis: 'Found Y' }, ['plan', 'analysis']);
    assert.ok(result.includes('--- plan ---'));
    assert.ok(result.includes('Step 1: do X'));
    assert.ok(result.includes('--- analysis ---'));
    assert.ok(result.includes('Found Y'));
  });

  it('only includes requested inputs', () => {
    const result = build({ plan: 'Step 1', extra: 'ignored' }, ['plan']);
    assert.ok(result.includes('--- plan ---'));
    assert.ok(!result.includes('extra'));
    assert.ok(!result.includes('ignored'));
  });
});

describe('Workflow definitions', () => {
  it('lite workflow has single execution phase', () => {
    const wf = WorkflowEngine.createLiteWorkflow();
    assert.strictEqual(wf.phases.length, 1);
    assert.strictEqual(wf.phases[0].type, 'execution');
  });

  it('brainstorm workflow has parallel config', () => {
    const wf = WorkflowEngine.createBrainstormWorkflow(true);
    assert.ok(wf.parallelConfig);
    assert.strictEqual(wf.parallelConfig!.maxConcurrency, 2);
    assert.strictEqual(wf.parallelConfig!.dependencyAware, true);
    // Codex and Gemini should both depend on 'topic' (parallelizable)
    assert.strictEqual(wf.phases[0].inputs[0], 'topic');
    assert.strictEqual(wf.phases[1].inputs[0], 'topic');
    // Synthesize depends on both outputs
    assert.deepStrictEqual(wf.phases[2].inputs, ['codex-analysis', 'gemini-analysis']);
  });

  it('five-phase workflow has correct phase structure', () => {
    const wf = WorkflowEngine.createFivePhaseWorkflow('test task');
    assert.ok(wf.phases.length >= 5); // Context + Analysis(2) + Prototype + Implement + Audit
    assert.strictEqual(wf.phases[0].id, 'context');
    assert.strictEqual(wf.phases[wf.phases.length - 1].id, 'audit');
  });

  it('collaborate workflow assigns different AIs', () => {
    const wf = WorkflowEngine.createCollaborateWorkflow();
    const ais = wf.phases.map(p => p.assignedAI);
    assert.ok(ais.includes('claude'));
    assert.ok(ais.includes('codex'));
    assert.ok(ais.includes('gemini'));
  });
});
