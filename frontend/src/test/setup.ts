import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mock HTMLDialogElement.showModal (not available in jsdom)
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = vi.fn();
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = vi.fn();
}

// Mock EventSource (not available in jsdom)
if (typeof globalThis.EventSource === "undefined") {
  const MockEventSourceClass = class MockEventSource {
    addEventListener(): void {}
    removeEventListener(): void {}
    close(): void {}
  };
  (globalThis as typeof globalThis & { EventSource: typeof EventSource }).EventSource =
    MockEventSourceClass as unknown as typeof EventSource;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
