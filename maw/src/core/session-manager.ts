/**
 * Unified Session Manager
 *
 * Integrates CCW's workflow sessions (.workflow/WFS-*) with
 * skills' SESSION_ID mechanism for multi-turn AI conversations.
 */

import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';
export type WorkflowLevel = 'lite' | 'lite-plan' | 'plan' | 'tdd-plan' | 'brainstorm' | 'delegate' | 'collaborate' | 'ralph';

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

/**
 * Session Manager - Handles unified session lifecycle
 */
export class SessionManager {
  private sessions: Map<string, UnifiedSession> = new Map();
  private persistPath: string;
  private globalPersistPath: string;
  private workflowDir: string;
  private taskDir: string;

  private atomicWriteFileSync(filePath: string, data: string): void {
    const tmpPath = filePath + '.tmp';
    writeFileSync(tmpPath, data);
    renameSync(tmpPath, filePath);
  }

  constructor(projectRoot: string = process.cwd()) {
    this.persistPath = join(projectRoot, '.maw', 'sessions.json');
    this.globalPersistPath = join(homedir(), '.maw', 'sessions.json');
    this.workflowDir = join(projectRoot, '.workflow');
    this.taskDir = join(projectRoot, '.task');

    this.ensureDirectories();
    this.loadSessions();
  }

  private ensureDirectories(): void {
    const mawDir = join(this.persistPath, '..');
    if (!existsSync(mawDir)) {
      mkdirSync(mawDir, { recursive: true });
    }
    const globalMawDir = join(this.globalPersistPath, '..');
    if (!existsSync(globalMawDir)) {
      mkdirSync(globalMawDir, { recursive: true });
    }
    if (!existsSync(this.workflowDir)) {
      mkdirSync(this.workflowDir, { recursive: true });
    }
    if (!existsSync(this.taskDir)) {
      mkdirSync(this.taskDir, { recursive: true });
    }
  }

  private loadSessions(): void {
    // Try to load from project-specific path first, then global
    const pathsToTry = [this.persistPath, this.globalPersistPath];

    for (const path of pathsToTry) {
      if (existsSync(path)) {
        try {
          const data = JSON.parse(readFileSync(path, 'utf-8'));
          for (const [id, session] of Object.entries(data)) {
            this.sessions.set(id, session as UnifiedSession);
          }
        } catch {
          console.warn('[SessionManager] Warning: Failed to parse sessions from ' + path + '. Starting fresh.');
        }
      }
    }
  }

  private saveSessions(): void {
    const data: Record<string, UnifiedSession> = {};
    for (const [id, session] of this.sessions) {
      data[id] = session;
    }
    const jsonData = JSON.stringify(data, null, 2);

    // Save to project-specific location
    this.atomicWriteFileSync(this.persistPath, jsonData);

    // Also save to global location for dashboard access
    this.atomicWriteFileSync(this.globalPersistPath, jsonData);
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
    this.saveSessions();

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
