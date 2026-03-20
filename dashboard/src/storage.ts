/**
 * Dashboard Storage - SQLite-based persistence layer
 *
 * Stores:
 * - Session history
 * - Workflow runs
 * - AI execution logs
 * - User preferences
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface SessionRecord {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'paused' | 'error';
  workflowLevel: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowRun {
  id: string;
  sessionId: string;
  level: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  result?: string;
  error?: string;
}

export interface AIExecutionLog {
  id: string;
  sessionId: string;
  aiProvider: 'claude' | 'codex' | 'gemini';
  prompt: string;
  response?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  tokensUsed?: number;
  error?: string;
}

const CURRENT_SCHEMA_VERSION = 1;

interface Migration {
  version: number;
  description: string;
  up: string;
}

const MIGRATIONS: Migration[] = [];

export class DashboardStorage {
  private db: Database.Database;
  private dbPath: string;

  constructor(dataDir: string) {
    const storageDir = path.join(dataDir, 'dashboard');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    this.dbPath = path.join(storageDir, 'dashboard.db');
    try {
      this.db = new Database(this.dbPath);
      this.initTables();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize dashboard database at ${this.dbPath}: ${msg}`);
    }
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT DEFAULT (datetime('now')),
        description TEXT
      )
    `);

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        workflow_level TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        metadata TEXT
      )
    `);

    // Workflow runs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        level TEXT,
        task TEXT,
        status TEXT DEFAULT 'pending',
        started_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        result TEXT,
        error TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // AI execution logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        ai_provider TEXT,
        prompt TEXT,
        response TEXT,
        status TEXT DEFAULT 'pending',
        started_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        tokens_used INTEGER,
        error TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // User preferences table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_workflow_session ON workflow_runs(session_id);
      CREATE INDEX IF NOT EXISTS idx_ai_session ON ai_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_status ON sessions(status);
    `);

    this.runMigrations();
  }

  private runMigrations(): void {
    const currentVersion = this.getSchemaVersion();
    for (const migration of MIGRATIONS.filter(m => m.version > currentVersion)) {
      try {
        this.db.exec(migration.up);
        this.db.prepare('INSERT INTO schema_version (version, description) VALUES (?, ?)').run(migration.version, migration.description);
      } catch (error) {
        console.error(`[Storage] Migration v${migration.version} failed:`, error);
        throw error;
      }
    }
    if (currentVersion === 0) {
      this.db.prepare('INSERT OR IGNORE INTO schema_version (version, description) VALUES (?, ?)').run(CURRENT_SCHEMA_VERSION, 'Initial schema');
    }
  }

  private getSchemaVersion(): number {
    try {
      const row = this.db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null } | undefined;
      return row?.version || 0;
    } catch {
      return 0;
    }
  }

  // ============= Sessions =============

  createSession(session: Omit<SessionRecord, 'createdAt' | 'updatedAt'>): SessionRecord {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, name, status, workflow_level, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.name,
      session.status,
      session.workflowLevel,
      session.metadata ? JSON.stringify(session.metadata) : null
    );

    return this.getSession(session.id)!;
  }

  getSession(id: string): SessionRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, name, status, workflow_level as workflowLevel,
             created_at as createdAt, updated_at as updatedAt, metadata
      FROM sessions WHERE id = ?
    `);

    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    } as SessionRecord;
  }

  listSessions(
    status?: string,
    limit: number = 50,
    offset: number = 0
  ): SessionRecord[] {
    let sql = `
      SELECT id, name, status, workflow_level as workflowLevel,
             created_at as createdAt, updated_at as updatedAt, metadata
      FROM sessions
    `;
    const params: unknown[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    })) as SessionRecord[];
  }

  updateSession(id: string, updates: Partial<SessionRecord>): SessionRecord | null {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (updates.workflowLevel !== undefined) {
      fields.push('workflow_level = ?');
      params.push(updates.workflowLevel);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      params.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) return this.getSession(id);

    fields.push("updated_at = datetime('now')");
    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE sessions SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);

    return this.getSession(id);
  }

  deleteSession(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ============= Workflow Runs =============

  createWorkflowRun(run: Omit<WorkflowRun, 'startedAt'>): WorkflowRun {
    const stmt = this.db.prepare(`
      INSERT INTO workflow_runs (id, session_id, level, task, status, result, error)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      run.id,
      run.sessionId,
      run.level,
      run.task,
      run.status,
      run.result || null,
      run.error || null
    );

    return this.getWorkflowRun(run.id)!;
  }

  getWorkflowRun(id: string): WorkflowRun | null {
    const stmt = this.db.prepare(`
      SELECT id, session_id as sessionId, level, task, status,
             started_at as startedAt, completed_at as completedAt,
             result, error
      FROM workflow_runs WHERE id = ?
    `);

    return stmt.get(id) as WorkflowRun | null;
  }

  listWorkflowRuns(sessionId?: string, limit: number = 50): WorkflowRun[] {
    let sql = `
      SELECT id, session_id as sessionId, level, task, status,
             started_at as startedAt, completed_at as completedAt,
             result, error
      FROM workflow_runs
    `;
    const params: unknown[] = [];

    if (sessionId) {
      sql += ' WHERE session_id = ?';
      params.push(sessionId);
    }

    sql += ' ORDER BY started_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as WorkflowRun[];
  }

  updateWorkflowRun(id: string, updates: Partial<WorkflowRun>): WorkflowRun | null {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (updates.result !== undefined) {
      fields.push('result = ?');
      params.push(updates.result);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      params.push(updates.error);
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      params.push(updates.completedAt);
    }

    if (fields.length === 0) return this.getWorkflowRun(id);

    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE workflow_runs SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);

    return this.getWorkflowRun(id);
  }

  /**
   * Get workflow run by task ID (for MAW bridge sync)
   */
  getWorkflowByTaskId(taskId: string): WorkflowRun | null {
    const stmt = this.db.prepare(`
      SELECT id, session_id as sessionId, level, task, status,
             started_at as startedAt, completed_at as completedAt,
             result, error
      FROM workflow_runs WHERE id = ? OR task LIKE ?
    `);

    return stmt.get(taskId, `%${taskId}%`) as WorkflowRun | null;
  }

  /**
   * Get all workflows for a session
   */
  getWorkflowsBySession(sessionId: string): WorkflowRun[] {
    const stmt = this.db.prepare(`
      SELECT id, session_id as sessionId, level, task, status,
             started_at as startedAt, completed_at as completedAt,
             result, error
      FROM workflow_runs
      WHERE session_id = ?
      ORDER BY started_at DESC
    `);

    return stmt.all(sessionId) as WorkflowRun[];
  }

  /**
   * Get AI logs for a session
   */
  getAILogsBySession(sessionId: string): AIExecutionLog[] {
    const stmt = this.db.prepare(`
      SELECT id, session_id as sessionId, ai_provider as aiProvider,
             prompt, response, status,
             started_at as startedAt, completed_at as completedAt,
             tokens_used as tokensUsed, error
      FROM ai_logs
      WHERE session_id = ?
      ORDER BY started_at DESC
    `);

    return stmt.all(sessionId) as AIExecutionLog[];
  }

  // ============= AI Execution Logs =============

  createAILog(log: Omit<AIExecutionLog, 'startedAt'>): AIExecutionLog {
    const stmt = this.db.prepare(`
      INSERT INTO ai_logs (id, session_id, ai_provider, prompt, response, status, tokens_used, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      log.id,
      log.sessionId,
      log.aiProvider,
      log.prompt,
      log.response || null,
      log.status,
      log.tokensUsed || null,
      log.error || null
    );

    return this.getAILog(log.id)!;
  }

  getAILog(id: string): AIExecutionLog | null {
    const stmt = this.db.prepare(`
      SELECT id, session_id as sessionId, ai_provider as aiProvider,
             prompt, response, status,
             started_at as startedAt, completed_at as completedAt,
             tokens_used as tokensUsed, error
      FROM ai_logs WHERE id = ?
    `);

    return stmt.get(id) as AIExecutionLog | null;
  }

  listAILogs(sessionId?: string, aiProvider?: string, limit: number = 100): AIExecutionLog[] {
    let sql = `
      SELECT id, session_id as sessionId, ai_provider as aiProvider,
             prompt, response, status,
             started_at as startedAt, completed_at as completedAt,
             tokens_used as tokensUsed, error
      FROM ai_logs
    `;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (sessionId) {
      conditions.push('session_id = ?');
      params.push(sessionId);
    }
    if (aiProvider) {
      conditions.push('ai_provider = ?');
      params.push(aiProvider);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY started_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as AIExecutionLog[];
  }

  updateAILog(id: string, updates: Partial<AIExecutionLog>): AIExecutionLog | null {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (updates.response !== undefined) {
      fields.push('response = ?');
      params.push(updates.response);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      params.push(updates.completedAt);
    }
    if (updates.tokensUsed !== undefined) {
      fields.push('tokens_used = ?');
      params.push(updates.tokensUsed);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      params.push(updates.error);
    }

    if (fields.length === 0) return this.getAILog(id);

    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE ai_logs SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);

    return this.getAILog(id);
  }

  // ============= Preferences =============

  getPreference(key: string): unknown | null {
    const stmt = this.db.prepare('SELECT value FROM preferences WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  setPreference(key: string, value: unknown): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)
    `);
    stmt.run(key, JSON.stringify(value));
  }

  // ============= Stats =============

  getStats(): {
    totalSessions: number;
    activeSessions: number;
    totalWorkflows: number;
    totalAIExecutions: number;
    aiProviderUsage: Record<string, number>;
  } {
    const sessionCount = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
    const activeCount = this.db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'active'").get() as { count: number };
    const workflowCount = this.db.prepare('SELECT COUNT(*) as count FROM workflow_runs').get() as { count: number };
    const aiCount = this.db.prepare('SELECT COUNT(*) as count FROM ai_logs').get() as { count: number };

    const providerUsage = this.db.prepare(`
      SELECT ai_provider, COUNT(*) as count
      FROM ai_logs
      GROUP BY ai_provider
    `).all() as Array<{ ai_provider: string; count: number }>;

    return {
      totalSessions: sessionCount.count,
      activeSessions: activeCount.count,
      totalWorkflows: workflowCount.count,
      totalAIExecutions: aiCount.count,
      aiProviderUsage: providerUsage.reduce(
        (acc, row) => ({ ...acc, [row.ai_provider]: row.count }),
        {}
      ),
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

export default DashboardStorage;
