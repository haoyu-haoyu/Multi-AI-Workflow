import type { SessionStore } from './session-store.js';

export class MemorySessionStore<TSession, TGlobalRef> implements SessionStore<TSession, TGlobalRef> {
  private projectSessions: Record<string, TSession> = {};
  private globalSessions: Record<string, TGlobalRef> = {};

  ensureReady(): void {}

  loadProjectSessions(): Record<string, TSession> {
    return structuredClone(this.projectSessions);
  }

  loadGlobalSessions(): Record<string, TGlobalRef> {
    return structuredClone(this.globalSessions);
  }

  saveProjectSessions(sessions: Record<string, TSession>): void {
    this.projectSessions = structuredClone(sessions);
  }

  saveGlobalSessions(sessions: Record<string, TGlobalRef>): void {
    this.globalSessions = structuredClone(sessions);
  }
}
