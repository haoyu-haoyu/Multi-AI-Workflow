import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

export interface SessionPaths {
  projectRoot: string;
  projectSessionsPath: string;
  globalSessionsPath: string;
  eventsDir: string;
  workflowDir: string;
  taskDir: string;
}

export interface SessionPathProvider {
  getPaths(): SessionPaths;
  ensureDirectories(): void;
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export class DefaultSessionPathProvider implements SessionPathProvider {
  private readonly paths: SessionPaths;

  constructor(projectRoot: string = process.cwd()) {
    this.paths = {
      projectRoot,
      projectSessionsPath: join(projectRoot, '.maw', 'sessions.json'),
      globalSessionsPath: join(homedir(), '.maw', 'sessions.json'),
      eventsDir: join(homedir(), '.maw', 'events'),
      workflowDir: join(projectRoot, '.workflow'),
      taskDir: join(projectRoot, '.task'),
    };
  }

  getPaths(): SessionPaths {
    return this.paths;
  }

  ensureDirectories(): void {
    ensureDir(dirname(this.paths.projectSessionsPath));
    ensureDir(dirname(this.paths.globalSessionsPath));
    ensureDir(this.paths.eventsDir);
    ensureDir(this.paths.workflowDir);
    ensureDir(this.paths.taskDir);
  }
}

export class StaticSessionPathProvider implements SessionPathProvider {
  constructor(private readonly paths: SessionPaths) {}

  getPaths(): SessionPaths {
    return this.paths;
  }

  ensureDirectories(): void {
    ensureDir(dirname(this.paths.projectSessionsPath));
    ensureDir(dirname(this.paths.globalSessionsPath));
    ensureDir(this.paths.eventsDir);
    ensureDir(this.paths.workflowDir);
    ensureDir(this.paths.taskDir);
  }
}
