import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import type { SessionPathProvider } from './path-provider.js';
import type { SessionStore } from './session-store.js';

function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, data);
  renameSync(tmpPath, filePath);
}

function readJsonFile<T>(filePath: string, label: string): Record<string, T> {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, T>;
  } catch {
    console.warn(`[SessionStore] Warning: Failed to parse ${label} from ${filePath}. Starting fresh.`);
    return {};
  }
}

export class FileSessionStore<TSession, TGlobalRef> implements SessionStore<TSession, TGlobalRef> {
  constructor(private readonly pathProvider: SessionPathProvider) {}

  ensureReady(): void {
    this.pathProvider.ensureDirectories();
  }

  loadProjectSessions(): Record<string, TSession> {
    return readJsonFile<TSession>(this.pathProvider.getPaths().projectSessionsPath, 'project sessions');
  }

  loadGlobalSessions(): Record<string, TGlobalRef> {
    return readJsonFile<TGlobalRef>(this.pathProvider.getPaths().globalSessionsPath, 'global sessions');
  }

  saveProjectSessions(sessions: Record<string, TSession>): void {
    atomicWriteFileSync(
      this.pathProvider.getPaths().projectSessionsPath,
      JSON.stringify(sessions, null, 2),
    );
  }

  saveGlobalSessions(sessions: Record<string, TGlobalRef>): void {
    atomicWriteFileSync(
      this.pathProvider.getPaths().globalSessionsPath,
      JSON.stringify(sessions, null, 2),
    );
  }
}
