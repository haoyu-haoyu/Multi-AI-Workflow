export interface EventSink<TEvent> {
  ensureReady(): void;
  emit(event: TEvent): void;
}

export class NoopEventSink<TEvent> implements EventSink<TEvent> {
  ensureReady(): void {}

  emit(_event: TEvent): void {}
}
