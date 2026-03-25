/**
 * MAW Bridge - Integrates MAW CLI data with Dashboard
 *
 * Reads session data from MAW's file-based storage and syncs with Dashboard SQLite.
 */

import { existsSync, readFileSync, readdirSync, watchFile, unwatchFile, unlinkSync, watch } from 'fs';
import type { FSWatcher } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { DashboardStorage } from './storage';

interface MAWSession {
  mawSessionId: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  workflowLevel?: string;
  aiSessions: {
    claude?: string;
    codex?: string;
    gemini?: string;
  };
  sharedContext: {
    projectRoot: string;
    relevantFiles: string[];
    taskHistory: Array<{
      id: string;
      description: string;
      assignedAI: string;
      status: string;
      timestamp: string;
      result?: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
}

// SessionManager format (key-value object)
interface SessionManagerData {
  [sessionId: string]: {
    mawSessionId: string;
    name?: string;  // Top-level name field
    aiSessions: Record<string, string>;
    workflowSession?: {
      wfsPath: string;
      taskFiles: string[];
      level: string;
    };
    sharedContext: {
      projectRoot: string;
      relevantFiles: string[];
      taskHistory: Array<{
        id: string;
        description: string;
        assignedAI: string;
        status: string;
        timestamp: string;
        result?: string;
      }>;
    };
    metadata: {
      name?: string;  // Metadata name (backup)
      status: string;
      createdAt: string;
      updatedAt: string;
    };
  };
}

// Legacy format (array-based)
interface MAWSessionsFile {
  sessions: MAWSession[];
  lastUpdated: string;
}

interface ImplPlan {
  sessionId: string;
  plan: string;
  timestamp: string;
}

interface SkillManifest {
  name: string;
  version: string;
  description: string;
  type: 'built-in' | 'ai-bridge' | 'custom';
  path: string;
  bridge?: {
    targetAI: string;
    scriptPath: string;
    supportsSession: boolean;
  };
  enabled: boolean;
}

// Map MAW status to Dashboard status
function mapStatus(status: string): 'active' | 'completed' | 'paused' | 'error' {
  switch (status) {
    case 'active': return 'active';
    case 'completed': return 'completed';
    case 'paused': return 'paused';
    case 'archived': return 'completed'; // Map archived to completed
    case 'error': return 'error';
    default: return 'active';
  }
}

export class MAWBridge {
  private dataDir: string;
  private storage: DashboardStorage;
  private watchers: Map<string, ReturnType<typeof watchFile>> = new Map();
  private sessionPaths: string[] = [];

  constructor(dataDir: string, storage: DashboardStorage) {
    this.dataDir = dataDir;
    this.storage = storage;

    // Search multiple locations for sessions.json
    this.sessionPaths = [
      join(homedir(), '.maw', 'sessions.json'),           // Global installation
      join(dataDir, 'sessions.json'),                      // Provided dataDir
      join(process.cwd(), '.maw', 'sessions.json'),       // Current working directory
    ];
  }

  /**
   * Initialize bridge and sync existing data
   */
  async initialize(): Promise<void> {
    console.log('[MAW Bridge] Initializing...');
    await this.syncSessions();
    await this.syncWorkflowPlans();
    this.startWatching();
  }

  /**
   * Parse sessions data - handles both SessionManager format and legacy format
   */
  private parseSessionsData(content: string): MAWSession[] {
    const data = JSON.parse(content);

    // Check if it's the SessionManager format (object with session IDs as keys)
    if (data && typeof data === 'object' && !Array.isArray(data) && !data.sessions) {
      // SessionManager format: { "session-id": { ... }, ... }
      const sessions: MAWSession[] = [];
      for (const [sessionId, sessionData] of Object.entries(data as SessionManagerData)) {
        const session = sessionData as SessionManagerData[string];
        sessions.push({
          mawSessionId: session.mawSessionId || sessionId,
          name: session.name || session.metadata?.name || 'Unnamed Session',
          status: (session.metadata?.status || 'active') as 'active' | 'paused' | 'completed' | 'archived',
          workflowLevel: session.workflowSession?.level || 'plan',
          aiSessions: session.aiSessions || {},
          sharedContext: session.sharedContext || {
            projectRoot: '',
            relevantFiles: [],
            taskHistory: [],
          },
          createdAt: session.metadata?.createdAt || new Date().toISOString(),
          updatedAt: session.metadata?.updatedAt || new Date().toISOString(),
        });
      }
      return sessions;
    }

    // Legacy format: { sessions: [...], lastUpdated: "..." }
    if (data.sessions && Array.isArray(data.sessions)) {
      return data.sessions;
    }

    return [];
  }

  /**
   * Sync MAW sessions to Dashboard
   */
  async syncSessions(): Promise<void> {
    let foundSessions = false;

    for (const sessionsPath of this.sessionPaths) {
      if (!existsSync(sessionsPath)) {
        continue;
      }

      console.log(`[MAW Bridge] Found sessions at: ${sessionsPath}`);
      foundSessions = true;

      try {
        const content = readFileSync(sessionsPath, 'utf-8');
        const sessions = this.parseSessionsData(content);

        for (const session of sessions) {
          // Check if session exists in dashboard
          const existing = this.storage.getSession(session.mawSessionId);

          if (!existing) {
            // Create new session in dashboard
            this.storage.createSession({
              id: session.mawSessionId,
              name: session.name,
              status: mapStatus(session.status),
              workflowLevel: session.workflowLevel || 'plan',
              metadata: {
                aiSessions: session.aiSessions,
                projectRoot: session.sharedContext.projectRoot,
              },
            });
            console.log(`[MAW Bridge] Synced session: ${session.name}`);
          } else {
            // Update existing session
            this.storage.updateSession(session.mawSessionId, {
              name: session.name,
              status: mapStatus(session.status),
              metadata: {
                aiSessions: session.aiSessions,
                projectRoot: session.sharedContext.projectRoot,
              },
            });
          }

          // Sync task history as workflow runs
          for (const task of session.sharedContext.taskHistory) {
            const existingWorkflow = this.storage.getWorkflowByTaskId(task.id);

            if (!existingWorkflow) {
              this.storage.createWorkflowRun({
                id: task.id || uuidv4(),
                sessionId: session.mawSessionId,
                task: task.description,
                level: session.workflowLevel || 'plan',
                status: mapStatus(task.status) as 'pending' | 'running' | 'completed' | 'failed',
                result: task.result,
              });
            }
          }
        }
      } catch (error) {
        console.error(`[MAW Bridge] Error syncing sessions from ${sessionsPath}:`, error);
      }
    }

    if (!foundSessions) {
      console.log('[MAW Bridge] No sessions.json found in any location');
    }
  }

  /**
   * Sync workflow plans from .task directory
   */
  async syncWorkflowPlans(): Promise<void> {
    const taskDir = join(this.dataDir, '..', '.task');

    if (!existsSync(taskDir)) {
      console.log('[MAW Bridge] No .task directory found');
      return;
    }

    try {
      const files = readdirSync(taskDir).filter(f => f.startsWith('IMPL_PLAN-') && f.endsWith('.json'));

      for (const file of files) {
        const content = readFileSync(join(taskDir, file), 'utf-8');
        const plan: ImplPlan = JSON.parse(content);

        // Create AI log for the plan
        this.storage.createAILog({
          id: uuidv4(),
          sessionId: plan.sessionId,
          aiProvider: 'claude',
          prompt: 'Generate implementation plan',
          response: plan.plan,
          status: 'completed',
        });
      }
    } catch (error) {
      console.error('[MAW Bridge] Error syncing workflow plans:', error);
    }
  }

  /**
   * Get installed skills from skill directories
   */
  getInstalledSkills(): SkillManifest[] {
    const skills: SkillManifest[] = [];
    const skillPaths = [
      join(this.dataDir, 'skills'),
      join(process.env.HOME || '~', '.maw', 'skills'),
    ];

    for (const skillPath of skillPaths) {
      if (!existsSync(skillPath)) continue;

      try {
        const entries = readdirSync(skillPath, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('_')) continue;

          const manifestPath = join(skillPath, entry.name, 'skill.json');
          const skillMdPath = join(skillPath, entry.name, 'SKILL.md');

          let manifest: Partial<SkillManifest> = {
            name: entry.name,
            path: join(skillPath, entry.name),
            enabled: true,
          };

          // Read skill.json if exists
          if (existsSync(manifestPath)) {
            try {
              const json = JSON.parse(readFileSync(manifestPath, 'utf-8'));
              manifest = { ...manifest, ...json };
            } catch {
              // Continue with defaults
            }
          }

          // Read description from SKILL.md if exists
          if (existsSync(skillMdPath)) {
            try {
              const content = readFileSync(skillMdPath, 'utf-8');
              const descMatch = content.match(/description:\s*(.+)/i);
              if (descMatch) {
                manifest.description = descMatch[1].trim();
              }
            } catch {
              // Continue
            }
          }

          // Detect AI bridge type
          if (entry.name.includes('codex')) {
            manifest.type = 'ai-bridge';
            manifest.bridge = { targetAI: 'codex', scriptPath: 'scripts/codex_bridge.py', supportsSession: true };
          } else if (entry.name.includes('gemini')) {
            manifest.type = 'ai-bridge';
            manifest.bridge = { targetAI: 'gemini', scriptPath: 'scripts/gemini_bridge.py', supportsSession: true };
          } else {
            manifest.type = 'custom';
          }

          manifest.version = manifest.version || '1.0.0';
          manifest.description = manifest.description || `Skill: ${entry.name}`;

          skills.push(manifest as SkillManifest);
        }
      } catch (error) {
        console.error(`[MAW Bridge] Error reading skills from ${skillPath}:`, error);
      }
    }

    return skills;
  }

  /**
   * Get session with full details including AI sessions
   */
  getSessionDetails(sessionId: string): {
    session: ReturnType<DashboardStorage['getSession']>;
    aiSessions: Record<string, string>;
    workflows: ReturnType<DashboardStorage['getWorkflowsBySession']>;
  } | null {
    const session = this.storage.getSession(sessionId);
    if (!session) return null;

    let aiSessions: Record<string, string> = {};
    try {
      const metadata = session.metadata || {};
      aiSessions = (metadata as Record<string, unknown>).aiSessions as Record<string, string> || {};
    } catch {
      // Empty metadata
    }

    const workflows = this.storage.getWorkflowsBySession(sessionId);

    return { session, aiSessions, workflows };
  }

  /**
   * Start watching for file changes
   */
  private eventWatcher: FSWatcher | null = null;

  private startWatching(): void {
    // Watch all session paths (legacy full-sync fallback)
    for (const sessionsPath of this.sessionPaths) {
      if (existsSync(sessionsPath)) {
        watchFile(sessionsPath, { interval: 2000 }, () => {
          console.log(`[MAW Bridge] ${sessionsPath} changed, resyncing...`);
          this.syncSessions();
        });
        this.watchers.set(sessionsPath, sessionsPath as any);
        console.log(`[MAW Bridge] Watching: ${sessionsPath}`);
      }
    }

    // Watch events directory for incremental updates from CLI
    this.startEventWatcher();
  }

  /**
   * Watch ~/.maw/events/ for incremental session events from the CLI.
   * Each event is a JSON file written by SessionManager.emitEvent().
   */
  private startEventWatcher(): void {
    const eventsDir = join(homedir(), '.maw', 'events');
    if (!existsSync(eventsDir)) return;

    try {
      this.eventWatcher = watch(eventsDir, (eventType, filename) => {
        if (!filename?.endsWith('.json') || eventType !== 'rename') return;
        const eventPath = join(eventsDir, filename);
        if (!existsSync(eventPath)) return;

        try {
          const event = JSON.parse(readFileSync(eventPath, 'utf-8'));
          this.processEvent(event);
          // Remove processed event file to avoid reprocessing
          try { unlinkSync(eventPath); } catch { /* ignore cleanup errors */ }
        } catch {
          // Ignore malformed event files
        }
      });
      console.log(`[MAW Bridge] Watching events: ${eventsDir}`);
    } catch (err) {
      console.warn('[MAW Bridge] Could not watch events directory:', err);
    }
  }

  /**
   * Process a single session event from the CLI and sync to SQLite.
   */
  private processEvent(event: { type: string; sessionId: string; data: Record<string, unknown> }): void {
    try {
      switch (event.type) {
        case 'session.created': {
          const existing = this.storage.getSession(event.sessionId);
          if (!existing) {
            this.storage.createSession({
              id: event.sessionId,
              name: (event.data.name as string) || 'CLI Session',
              status: (event.data.status as 'active') || 'active',
              workflowLevel: (event.data.workflowLevel as string) || 'plan',
            });
          }
          console.log(`[MAW Bridge] Event: session created ${event.sessionId}`);
          break;
        }
        case 'session.updated':
        case 'session.completed': {
          this.storage.updateSession(event.sessionId, {
            status: (event.data.status as 'active' | 'completed' | 'paused') || 'active',
          });
          console.log(`[MAW Bridge] Event: session ${event.type} ${event.sessionId}`);
          break;
        }
        case 'task.added': {
          const taskId = (event.data.taskId as string) || event.sessionId;
          this.storage.createWorkflowRun({
            id: taskId,
            sessionId: event.sessionId,
            level: '',
            task: (event.data.description as string) || '',
            status: (event.data.status as 'pending' | 'running' | 'completed' | 'failed') || 'pending',
          });
          console.log(`[MAW Bridge] Event: task added to ${event.sessionId}`);
          break;
        }
        case 'ai.linked': {
          this.storage.updateSession(event.sessionId, {
            metadata: {
              aiSessions: { [(event.data.aiType as string)]: event.data.externalSessionId },
            },
          });
          console.log(`[MAW Bridge] Event: AI linked to ${event.sessionId}`);
          break;
        }
      }
    } catch (err) {
      console.warn(`[MAW Bridge] Failed to process event ${event.type}:`, err);
    }
  }

  /**
   * Stop watching files
   */
  stopWatching(): void {
    for (const path of this.watchers.keys()) {
      unwatchFile(path);
    }
    this.watchers.clear();
    if (this.eventWatcher) {
      this.eventWatcher.close();
      this.eventWatcher = null;
    }
  }
}

export default MAWBridge;
