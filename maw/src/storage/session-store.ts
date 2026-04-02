export interface SessionStore<TSession, TGlobalRef> {
  ensureReady(): void;
  loadProjectSessions(): Record<string, TSession>;
  loadGlobalSessions(): Record<string, TGlobalRef>;
  saveProjectSessions(sessions: Record<string, TSession>): void;
  saveGlobalSessions(sessions: Record<string, TGlobalRef>): void;
}
