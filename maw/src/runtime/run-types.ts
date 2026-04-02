import type { AIExecutionResult, SandboxLevel } from '../adapters/base-adapter.js';
import type { UnifiedSession } from '../core/session-manager.js';
import type {
  WorkflowContext,
  WorkflowDefinition,
  WorkflowResult,
} from '../core/workflow-engine.js';

export interface PolicyContext {
  sandbox: SandboxLevel;
  allowNetwork?: boolean;
  writableRoots?: string[];
  requiresApprovalFor?: string[];
  trustLevel?: 'interactive' | 'headless' | 'automation';
}

export interface DelegateRunRequest {
  provider: string;
  task: string;
  projectRoot: string;
  sessionId?: string;
  stream?: boolean;
  policy: PolicyContext;
}

export interface DelegateRunResult {
  provider: string;
  session: UnifiedSession;
  execution: AIExecutionResult;
}

export interface WorkflowRunRequest {
  workflow: WorkflowDefinition;
  context: WorkflowContext;
}

export interface WorkflowRunResult {
  result: WorkflowResult;
}
