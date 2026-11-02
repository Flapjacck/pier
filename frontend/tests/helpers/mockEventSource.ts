/**
 * Typed mock EventSource for testing hooks that use EventSource.
 * Stores instances so tests can emit events on them.
 * Install per test with `vi.stubGlobal("EventSource", MockEventSource)`.
 */
export class MockEventSource {
  public static instances: MockEventSource[] = [];

  public url: string;
  public readyState: number = 0;
  public closed: boolean = false;
  private listeners: Map<string, Set<EventListener>> = new Map();

  constructor(url: string | URL) {
    this.url = String(url);
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = 2;
    this.closed = true;
  }

  emitOpen(): void {
    this.readyState = 1;
    const event = new Event("open");
    this.emit(event);
  }

  emitMessage(data: string): void {
    const event = new MessageEvent("message", { data });
    this.emit(event);
  }

  emitError(): void {
    const event = new Event("error");
    this.emit(event);
  }

  emitNamed(type: string, data?: unknown): void {
    const event = new Event(type);
    if (data !== undefined) {
      Object.defineProperty(event, "data", { value: data, writable: false });
    }
    this.emit(event);
  }

  /** Dispatch any event to listeners registered for its type. */
  emit(event: Event): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
  }
}
