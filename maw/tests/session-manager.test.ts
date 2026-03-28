import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SessionManager } from '../src/core/session-manager.js';

// Use a unique dir per run so parallel tests don't collide.
// We intentionally do NOT delete it in afterEach — the SessionManager
// registers a process.on('exit') flush handler that writes after cleanup.
// Temp dirs are cleaned by the OS.
const TEST_DIR = join(tmpdir(), 'maw-test-sessions-' + Date.now());

describe('SessionManager', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  it('creates a session with correct structure', async () => {
    const manager = new SessionManager(TEST_DIR);
    const session = await manager.createSession({ name: 'test-session' });
    assert.ok(session.mawSessionId);
    assert.strictEqual(session.name, 'test-session');
    assert.strictEqual(session.metadata.status, 'active');
    assert.ok(session.metadata.createdAt);
    assert.ok(session.metadata.updatedAt);
    manager.flushSessions();
  });

  it('retrieves a session by ID', async () => {
    const manager = new SessionManager(TEST_DIR);
    const session = await manager.createSession({ name: 'findme' });
    const found = manager.getSession(session.mawSessionId);
    assert.ok(found);
    assert.strictEqual(found!.name, 'findme');
    manager.flushSessions();
  });

  it('lists all sessions', async () => {
    const manager = new SessionManager(TEST_DIR);
    await manager.createSession({ name: 'session-1' });
    await manager.createSession({ name: 'session-2' });
    const all = manager.listSessions();
    assert.ok(all.length >= 2);
    manager.flushSessions();
  });

  it('persists sessions to disk', async () => {
    const manager = new SessionManager(TEST_DIR);
    await manager.createSession({ name: 'persist-test' });
    manager.flushSessions();
    const sessionsFile = join(TEST_DIR, '.maw', 'sessions.json');
    assert.ok(existsSync(sessionsFile));
  });
});
