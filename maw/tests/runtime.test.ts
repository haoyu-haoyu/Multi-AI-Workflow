import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  BaseAIAdapter,
  type AIFeature,
  type AIExecutionOptions,
  type AIExecutionResult,
  type StreamChunk,
} from '../src/adapters/base-adapter.js';
import { NoopEventSink } from '../src/events/event-sink.js';
import { SessionManager } from '../src/core/session-manager.js';
import { MAWRuntime } from '../src/runtime/maw-runtime.js';
import { MemorySessionStore } from '../src/storage/memory-session-store.js';
import { StaticSessionPathProvider } from '../src/storage/path-provider.js';

class FakeCodexAdapter extends BaseAIAdapter {
  readonly name = 'codex';
  readonly supportedFeatures: AIFeature[] = ['multi-turn'];

  async execute(options: AIExecutionOptions): Promise<AIExecutionResult> {
    return {
      success: true,
      sessionId: 'external-session-1',
      content: `handled:${options.prompt}`,
      metadata: {
        model: 'fake-codex',
        executionTime: 1,
        aiType: this.name,
      },
    };
  }

  async *stream(
    options: AIExecutionOptions,
  ): AsyncGenerator<StreamChunk, AIExecutionResult, unknown> {
    const result = await this.execute(options);
    yield {
      type: 'content',
      content: result.content,
    };
    return result;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

describe('MAWRuntime', () => {
  it('delegates through a registered provider and records the session side effects', async () => {
    const testRoot = join(tmpdir(), `maw-runtime-${Date.now()}`);
    const sessionManager = new SessionManager(testRoot, {
      registerExitHook: false,
      pathProvider: new StaticSessionPathProvider({
        projectRoot: testRoot,
        projectSessionsPath: join(testRoot, '.maw', 'sessions.json'),
        globalSessionsPath: join(testRoot, '.global', 'sessions.json'),
        eventsDir: join(testRoot, '.events'),
        workflowDir: join(testRoot, '.workflow'),
        taskDir: join(testRoot, '.task'),
      }),
      sessionStore: new MemorySessionStore(),
      eventSink: new NoopEventSink(),
    });

    const runtime = new MAWRuntime(sessionManager, testRoot);
    runtime.registerAdapter(new FakeCodexAdapter({ name: 'codex', enabled: true }));

    const result = await runtime.delegate({
      provider: 'codex',
      task: 'write tests',
      projectRoot: testRoot,
      policy: {
        sandbox: 'workspace-write',
        writableRoots: [testRoot],
        trustLevel: 'interactive',
      },
    });

    assert.strictEqual(result.execution.success, true);
    assert.strictEqual(result.execution.content, 'handled:write tests');
    assert.strictEqual(result.session.aiSessions.codex, 'external-session-1');
    assert.strictEqual(result.session.sharedContext.taskHistory.length, 1);
    assert.strictEqual(result.session.sharedContext.taskHistory[0]?.assignedAI, 'codex');

    sessionManager.dispose();
  });
});
