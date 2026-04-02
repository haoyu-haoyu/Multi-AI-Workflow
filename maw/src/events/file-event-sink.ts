import { renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SessionPathProvider } from '../storage/path-provider.js';
import type { EventSink } from './event-sink.js';

function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, data);
  renameSync(tmpPath, filePath);
}

function getEventType(event: unknown): string {
  if (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    typeof (event as { type?: unknown }).type === 'string'
  ) {
    return ((event as { type: string }).type || 'event').replace(/\./g, '-');
  }

  return 'event';
}

export class FileEventSink<TEvent> implements EventSink<TEvent> {
  constructor(private readonly pathProvider: SessionPathProvider) {}

  ensureReady(): void {
    this.pathProvider.ensureDirectories();
  }

  emit(event: TEvent): void {
    const { eventsDir } = this.pathProvider.getPaths();
    const filename = `${Date.now()}-${getEventType(event)}.json`;
    atomicWriteFileSync(join(eventsDir, filename), JSON.stringify(event));
  }
}
