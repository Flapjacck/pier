import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLogStream } from "./useLogStream";

describe("useLogStream", () => {
  it("starts in loading state before pod is known", () => {
    const { result } = renderHook(() =>
      useLogStream({ name: "myapp", pod: undefined })
    );

    expect(result.current.status.kind).toBe("loading");
    expect(result.current.lines).toHaveLength(0);
  });

  it("has 0 dropped count initially", () => {
    const { result } = renderHook(() =>
      useLogStream({ name: "myapp", pod: undefined })
    );

    expect(result.current.droppedCount).toBe(0);
  });

  it("exposes reconnectNow function", () => {
    const { result } = renderHook(() =>
      useLogStream({ name: "myapp", pod: undefined })
    );

    expect(typeof result.current.reconnectNow).toBe("function");
  });

  it("returns correct return type shape", () => {
    const { result } = renderHook(() =>
      useLogStream({ name: "myapp", pod: undefined })
    );

    expect(result.current).toHaveProperty("lines");
    expect(result.current).toHaveProperty("status");
    expect(result.current).toHaveProperty("droppedCount");
    expect(result.current).toHaveProperty("reconnectNow");
  });

  it("status.kind is valid", () => {
    const { result } = renderHook(() =>
      useLogStream({ name: "myapp", pod: undefined })
    );

    expect(result.current.status).toHaveProperty("kind");
    const validKinds = ["loading", "live", "paused", "error", "reconnecting", "ended", "pod-gone"];
    expect(validKinds).toContain(result.current.status.kind);
  });

  it.todo("schedules reconnect with exponential backoff on error");
  it.todo("resets attempt counter on successful connection");
  it.todo("handles follow mode with EventSource");
  it.todo("handles static mode with fetch");
});
