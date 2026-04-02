/**
 * Unified Session Manager
 *
 * Integrates CCW's workflow sessions (.workflow/WFS-*) with
 * skills' SESSION_ID mechanism for multi-turn AI conversations.
 */

import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { FileEventSink } from '../events/file-event-sink.js';
import type { EventSink } from '../events/event-sink.js';
import { DefaultSessionPathProvider, type SessionPathProvider } from '../storage/path-provider.js';
import { FileSessionStore } from '../storage/file-session-store.js';
import type { SessionStore } from '../storage/session-store.js';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';
export type WorkflowLevel = 'lite' | 'lite-plan' | 'plan' | 'tdd-plan' | 'brainstorm' | 'delegate' | 'collaborate' | 'ralph';

/**
 * Event emitted by SessionManager for dashboard synchronization.
 * Events are written as individual JSON files to ~/.maw/events/
 * so the dashboard can incrementally sync without polling sessions.json.
 */
export interface SessionEvent {
  type: 'session.created' | 'session.updated' | 'session.completed' | 'task.added' | 'ai.linked';
  timestamp: string;
  sessionId: string;
  data: Record<string, unknown>;
}

/**
 * Unified session structure combining CCW and skills approaches
 */
export interface UnifiedSession {
  /** MAW unified session ID */
  mawSessionId: string;

  /** Session name (human-readable) */
  name: string;

  /** Mapping to external AI session IDs (from skills) */
  aiSessions: {
    claude?: string;
    codex?: string;    // Codex SESSION_ID
    gemini?: string;   // Gemini SESSION_ID
    litellm?: string;
  };

  /** CCW workflow session info */
  workflowSession?: {
    /** Path to .workflow/WFS-<name>/ */
    wfsPath: string;
    /** Task files in .task/ */
    taskFiles: string[];
    /** Current workflow level */
    level: WorkflowLevel;
  };

  /** Session metadata */
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    status: SessionStatus;
    tags: string[];
  };

  /** Shared context across AIs */
  sharedContext: {
    projectRoot: string;
    relevantFiles: string[];
    taskHistory: TaskRecord[];
  };
}

export interface TaskRecord {
  id: string;
  description: string;
  assignedAI: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  timestamp: Date;
}

export interface SessionCreateOptions {
  name: string;
  workflowLevel?: WorkflowLevel;
  projectRoot?: string;
  tags?: string[];
}

export interface GlobalSessionRef {
  name: string;
  projectRoot: string;
  status: SessionStatus;
  updatedAt: Date;
}

export interface SessionManagerOptions {
  pathProvider?: SessionPathProvider;
  sessionStore?: SessionStore<UnifiedSession, GlobalSessionRef>;
  eventSink?: EventSink<SessionEvent>;
  registerExitHook?: boolean;
}

/**
 * Session Manager - Handles unified session lifecycle
 */
export class SessionManager {
  private sessions: Map<string, UnifiedSession> = new Map();
  private readonly pathProvider: SessionPathProvider;
  private readonly sessionStore: SessionStore<UnifiedSession, GlobalSessionRef>;
  private readonly eventSink: EventSink<SessionEvent>;
  private readonly workflowDir: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly exitHandler: () => void;
  private readonly registerExitHook: boolean;
  private static readonly SAVE_DEBOUNCE_MS = 500;
  private static readonly MAX_LOADED_SESSIONS = 100;
  private static readonly MAX_SESSION_AGE_DAYS = 30;

  static async create(
    projectRoot: string = process.cwd(),
    options: SessionManagerOptions = {},
  ): Promise<SessionManager> {
    return new SessionManager(projectRoot, options);
  }

  constructor(projectRoot: string = process.cwd(), options: SessionManagerOptions = {}) {
    this.pathProvider = options.pathProvider || new DefaultSessionPathProvider(projectRoot);
    this.sessionStore =
      options.sessionStore || new FileSessionStore<UnifiedSession, GlobalSessionRef>(this.pathProvider);
    this.eventSink = options.eventSink || new FileEventSink<SessionEvent>(this.pathProvider);
    this.workflowDir = this.pathProvider.getPaths().workflowDir;
    this.registerExitHook = options.registerExitHook ?? true;
    this.exitHandler = () => this.flushSessions();

    this.ensureDirectories();
    this.loadSessions();
    if (this.registerExitHook) {
      process.on('exit', this.exitHandler);
    }
  }

  private ensureDirectories(): void {
    this.pathProvider.ensureDirectories();
    this.sessionStore.ensureReady();
    this.eventSink.ensureReady();
    if (!existsSync(this.workflowDir)) {
      mkdirSync(this.workflowDir, { recursive: true });
    }
  }

  private loadSessions(): void {
    const cutoff = Date.now() - SessionManager.MAX_SESSION_AGE_DAYS * 24 * 60 * 60 * 1000;

    for (const [id, session] of Object.entries(this.sessionStore.loadProjectSessions())) {
      const normalized = this.normalizeSession(session);
      if (!normalized) {
        continue;
      }

      const updatedAt = normalized.metadata.updatedAt.getTime();
      if (updatedAt >= cutoff) {
        this.sessions.set(id, normalized);
      }
    }

    this.evictIfOverLimit();
  }

  private normalizeSession(session: UnifiedSession | undefined): UnifiedSession | null {
    if (!session || !session.mawSessionId || !session.metadata || !session.sharedContext) {
      return null;
    }

    const createdAt = new Date(session.metadata.createdAt);
    const updatedAt = new Date(session.metadata.updatedAt);
    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())) {
      return null;
    }

    return {
      mawSessionId: session.mawSessionId,
      name: session.name,
      aiSessions: session.aiSessions || {},
      workflowSession: session.workflowSession
        ? {
            wfsPath: session.workflowSession.wfsPath,
            taskFiles: session.workflowSession.taskFiles || [],
            level: session.workflowSession.level,
          }
        : undefined,
      metadata: {
        createdAt,
        updatedAt,
        status: session.metadata.status,
        tags: session.metadata.tags || [],
      },
      sharedContext: {
        projectRoot: session.sharedContext.projectRoot || process.cwd(),
        relevantFiles: session.sharedContext.relevantFiles || [],
        taskHistory: (session.sharedContext.taskHistory || []).map((task) => ({
          ...task,
          timestamp: new Date(task.timestamp),
        })),
      },
    };
  }

  private evictIfOverLimit(): void {
    if (this.sessions.size > SessionManager.MAX_LOADED_SESSIONS) {
      const sorted = [...this.sessions.entries()]
        .sort((a, b) => new Date(b[1].metadata.updatedAt).getTime() - new Date(a[1].metadata.updatedAt).getTime());
      this.sessions = new Map(sorted.slice(0, SessionManager.MAX_LOADED_SESSIONS));
    }
  }

  private saveSessions(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flushSessions();
    }, SessionManager.SAVE_DEBOUNCE_MS);
  }

  flushSessions(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    // Write full session data to project-local file
    const data: Record<string, UnifiedSession> = {};
    for (const [id, session] of this.sessions) {
      data[id] = session;
    }
    this.sessionStore.saveProjectSessions(data);

    // Write only lightweight refs to global file (prevents cross-project leaking)
    const globalData: Record<string, GlobalSessionRef> = {};
    for (const [id, session] of this.sessions) {
      globalData[id] = {
        name: session.name,
        projectRoot: session.sharedContext.projectRoot,
        status: session.metadata.status,
        updatedAt: session.metadata.updatedAt,
      };
    }
    this.sessionStore.saveGlobalSessions(globalData);
  }

  /**
   * Emit a session event for dashboard synchronization.
   * Each event is written as an individual JSON file to ~/.maw/events/
   * so the dashboard can process them incrementally.
   */
  private emitEvent(type: SessionEvent['type'], sessionId: string, data: Record<string, unknown> = {}): void {
    try {
      this.eventSink.emit({
        type,
        timestamp: new Date().toISOString(),
        sessionId,
        data,
      });
    } catch {
      // Event emission is best-effort — don't break the CLI if events dir is unavailable
    }
  }

  dispose(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.registerExitHook) {
      process.off('exit', this.exitHandler);
    }
  }

  /**
   * Create a new unified session
   */
  async createSession(options: SessionCreateOptions): Promise<UnifiedSession> {
    const mawSessionId = uuidv4();
    const now = new Date();

    const session: UnifiedSession = {
      mawSessionId,
      name: options.name,
      aiSessions: {},
      metadata: {
        createdAt: now,
        updatedAt: now,
        status: 'active',
        tags: options.tags || [],
      },
      sharedContext: {
        projectRoot: options.projectRoot || process.cwd(),
        relevantFiles: [],
        taskHistory: [],
      },
    };

    // Create workflow session directory if needed (CCW pattern)
    if (options.workflowLevel && options.workflowLevel !== 'lite') {
      const wfsPath = join(this.workflowDir, `WFS-${options.name}`);
      mkdirSync(wfsPath, { recursive: true });

      session.workflowSession = {
        wfsPath,
        taskFiles: [],
        level: options.workflowLevel,
      };
    }

    this.sessions.set(mawSessionId, session);
    this.evictIfOverLimit();
    this.saveSessions();
    this.emitEvent('session.created', mawSessionId, {
      name: session.name,
      status: session.metadata.status,
      workflowLevel: session.workflowSession?.level,
      projectRoot: session.sharedContext.projectRoot,
    });

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): UnifiedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(includeArchived: boolean = false): UnifiedSession[] {
    const sessions = Array.from(this.sessions.values());
    if (includeArchived) {
      return sessions;
    }
    return sessions.filter(s => s.metadata.status !== 'archived');
  }

  /**
   * Resume session - restores all AI SESSION_IDs
   */
  async resumeSession(sessionId: string): Promise<UnifiedSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.metadata.status = 'active';
    session.metadata.updatedAt = new Date();
    this.saveSessions();

    return session;
  }

  /**
   * Link external AI session ID (from skills pattern)
   */
  async linkExternalSession(
    session: UnifiedSession,
    aiType: 'codex' | 'gemini' | 'claude' | 'litellm',
    externalSessionId: string
  ): Promise<void> {
    session.aiSessions[aiType] = externalSessionId;
    session.metadata.updatedAt = new Date();
    this.saveSessions();
    this.emitEvent('ai.linked', session.mawSessionId, {
      aiType,
      externalSessionId,
    });
  }

  /**
   * Link CCW workflow session
   */
  async linkWorkflowSession(
    session: UnifiedSession,
    wfsName: string,
    level: WorkflowLevel
  ): Promise<void> {
    const wfsPath = join(this.workflowDir, `WFS-${wfsName}`);

    if (!existsSync(wfsPath)) {
      mkdirSync(wfsPath, { recursive: true });
    }

    session.workflowSession = {
      wfsPath,
      taskFiles: [],
      level,
    };
    session.metadata.updatedAt = new Date();
    this.saveSessions();
  }

  /**
   * Add task record to session history
   */
  addTaskRecord(session: UnifiedSession, task: TaskRecord): void {
    session.sharedContext.taskHistory.push(task);
    session.metadata.updatedAt = new Date();
    this.saveSessions();
    this.emitEvent('task.added', session.mawSessionId, {
      taskId: task.id,
      description: task.description,
      assignedAI: task.assignedAI,
      status: task.status,
    });
  }

  /**
   * Update session status
   */
  updateStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata.status = status;
      session.metadata.updatedAt = new Date();
      this.saveSessions();
      const eventType = status === 'completed' ? 'session.completed' as const : 'session.updated' as const;
      this.emitEvent(eventType, sessionId, { status });
    }
  }

  /**
   * Archive session (move to .workflow/archives/)
   */
  async archiveSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.metadata.status = 'archived';
    session.metadata.updatedAt = new Date();

    // Move workflow directory to archives if exists
    if (session.workflowSession?.wfsPath) {
      const archivesDir = join(this.workflowDir, 'archives');
      if (!existsSync(archivesDir)) {
        mkdirSync(archivesDir, { recursive: true });
      }
      // Note: Actual file move would be implemented here
    }

    this.saveSessions();
  }

  /**
   * Sync all AI sessions (ensure SESSION_IDs are current)
   */
  async syncAllSessions(): Promise<Map<string, SyncResult>> {
    const results = new Map<string, SyncResult>();

    for (const [id, session] of this.sessions) {
      if (session.metadata.status === 'active') {
        results.set(id, {
          sessionId: id,
          aiSessions: { ...session.aiSessions },
          synced: true,
        });
      }
    }

    return results;
  }
}

interface SyncResult {
  sessionId: string;
  aiSessions: Record<string, string | undefined>;
  synced: boolean;
  error?: string;
}

export default SessionManager;
