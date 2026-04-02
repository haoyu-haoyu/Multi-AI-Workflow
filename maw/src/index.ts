/**
 * Multi-AI Workflow (MAW) - Main Export
 *
 * Re-exports core functionality for programmatic use.
 */

export { run, program } from './cli.js';
export {
  SessionManager,
  type SessionManagerOptions,
  type UnifiedSession,
} from './core/session-manager.js';
export { SkillRegistry, type SkillManifest } from './core/skill-registry.js';
export { WorkflowEngine, type WorkflowDefinition } from './core/workflow-engine.js';
export { BaseAIAdapter, type AIExecutionResult } from './adapters/base-adapter.js';
export { loadConfig, type MAWConfig } from './config/loader.js';
export { MAWRuntime } from './runtime/maw-runtime.js';
export type { DelegateRunRequest, DelegateRunResult, PolicyContext } from './runtime/run-types.js';
export {
  DefaultSessionPathProvider,
  StaticSessionPathProvider,
} from './storage/path-provider.js';
export { FileSessionStore } from './storage/file-session-store.js';
export { MemorySessionStore } from './storage/memory-session-store.js';
export { NoopEventSink } from './events/event-sink.js';
