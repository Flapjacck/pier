import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ApiError } from "../../src/api/errors";
import { useLogStream, type UseLogStreamOptions } from "../../src/hooks/useLogStream";
import { MockEventSource } from "../helpers/mockEventSource";

const { getAppLogsText } = vi.hoisted(() => ({ getAppLogsText: vi.fn() }));

vi.mock("../../src/api/client", () => ({
  appLogsUrl: (name: string, opts: { pod?: string }) => `/api/apps/${name}/logs?pod=${opts.pod ?? ""}`,
  getAppLogsText,
}));

/** Let pending promise callbacks (the error probe, static fetch) run inside act. */
async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setup(options: Partial<UseLogStreamOptions> = {}) {
  return renderHook((props: UseLogStreamOptions) => useLogStream(props), {
    initialProps: { name: "app", pod: "pod-1", follow: true, ...options },
  });
}

function latest(): MockEventSource {
  const es = MockEventSource.instances.at(-1);
  if (!es) throw new Error("no EventSource opened");
  return es;
}

/** Fire a backend-sent error event (a MessageEvent), which retries without probing. */
function serverError(es: MockEventSource): void {
  act(() => es.emit(new MessageEvent("error", { data: "upstream closed" })));
}

describe("useLogStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
    getAppLogsText.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for a pod, then opens one EventSource for it", () => {
    const { rerender } = setup({ pod: undefined });
    expect(MockEventSource.instances).toHaveLength(0);

    rerender({ name: "app", pod: "pod-1", follow: true });
    expect(MockEventSource.instances).toHaveLength(1);
    expect(latest().url).toBe("/api/apps/app/logs?pod=pod-1");
  });

  it("goes live on open and appends messages on the next frame", () => {
    const { result } = setup();
    expect(result.current.status.kind).toBe("loading");

    act(() => latest().emitOpen());
    expect(result.current.status.kind).toBe("live");

    act(() => {
      latest().emitMessage("line 1");
      latest().emitMessage("line 2");
    });
    expect(result.current.lines).toHaveLength(0);

    act(() => vi.advanceTimersToNextFrame());
    expect(result.current.lines.map((l) => l.text)).toEqual(["line 1", "line 2"]);
  });

  it("reconnects with growing delays after server errors", () => {
    const { result } = setup();
    act(() => latest().emitOpen());

    serverError(latest());
    expect(latest().closed).toBe(true);
    expect(result.current.status).toEqual({ kind: "reconnecting", attempt: 1, nextRetryMs: 2000 });

    act(() => vi.advanceTimersByTime(1999));
    expect(MockEventSource.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(MockEventSource.instances).toHaveLength(2);

    serverError(latest());
    expect(result.current.status).toEqual({ kind: "reconnecting", attempt: 2, nextRetryMs: 4000 });
  });

  it("resets the backoff after a successful reopen", () => {
    const { result } = setup();
    serverError(latest());
    act(() => vi.advanceTimersByTime(2000));
    serverError(latest());
    expect(result.current.status).toMatchObject({ attempt: 2 });

    act(() => vi.advanceTimersByTime(4000));
    act(() => latest().emitOpen());
    expect(result.current.status.kind).toBe("live");

    serverError(latest());
    expect(result.current.status).toEqual({ kind: "reconnecting", attempt: 1, nextRetryMs: 2000 });
  });

  it("probes on a native error and retries when the pod still exists", async () => {
    getAppLogsText.mockResolvedValue("ok");
    const { result } = setup();

    act(() => latest().emitError());
    await flushPromises();

    expect(getAppLogsText).toHaveBeenCalledWith("app", { pod: "pod-1", tail: 1 }, expect.anything());
    expect(result.current.status).toMatchObject({ kind: "reconnecting", attempt: 1 });
  });

  it("shows pod-gone without retrying when the probe gets a 404", async () => {
    getAppLogsText.mockRejectedValue(new ApiError(404, { ok: false, error: "pod not found" }, "not_found"));
    const { result } = setup();

    act(() => latest().emitError());
    await flushPromises();

    expect(result.current.status.kind).toBe("pod-gone");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops on the end event without scheduling a retry", () => {
    const { result } = setup();
    act(() => latest().emitOpen());

    act(() => latest().emitNamed("end"));
    expect(result.current.status.kind).toBe("ended");
    expect(latest().closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reconnectNow cancels the pending retry and reopens immediately", () => {
    const { result } = setup();
    serverError(latest());
    expect(vi.getTimerCount()).toBe(1);

    act(() => result.current.reconnectNow());
    expect(MockEventSource.instances).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes the stream and clears timers on unmount", () => {
    const { unmount } = setup();
    const es = latest();
    serverError(es);
    act(() => vi.advanceTimersByTime(2000));
    const reopened = latest();
    serverError(reopened);

    unmount();
    expect(reopened.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("static mode fetches once, shows the lines and opens no stream", async () => {
    getAppLogsText.mockResolvedValue("a\nb\n");
    const { result } = setup({ follow: false });
    await flushPromises();

    expect(MockEventSource.instances).toHaveLength(0);
    expect(getAppLogsText).toHaveBeenCalledTimes(1);
    expect(result.current.status.kind).toBe("paused");
    expect(result.current.lines.map((l) => l.text)).toEqual(["a", "b"]);
  });
});
