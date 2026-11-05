import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/errors";
import { DEPLOY_POLL_MS, useDeployment } from "../../src/hooks/useDeployment";
import { detail } from "../helpers/deploys";
import { MockEventSource } from "../helpers/mockEventSource";

const { getDeployment } = vi.hoisted(() => ({ getDeployment: vi.fn() }));
vi.mock("../../src/api/client", () => ({
  getDeployment,
  deploymentStreamUrl: (name: string, id: number) => `/api/apps/${name}/deployments/${id}/stream`,
}));

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function stream(): MockEventSource {
  const es = MockEventSource.instances.at(-1);
  if (!es) throw new Error("no EventSource opened");
  return es;
}

describe("useDeployment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
    getDeployment.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads nothing without an id", () => {
    const { result } = renderHook(() => useDeployment("web", undefined));
    expect(result.current.loading).toBe(false);
    expect(getDeployment).not.toHaveBeenCalled();
  });

  it("does not open a stream for a finished deploy", async () => {
    getDeployment.mockResolvedValueOnce(detail());
    const { result } = renderHook(() => useDeployment("web", 1));
    await flush();
    expect(result.current.deployment?.status).toBe("succeeded");
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("follows the stream while running and closes on end", async () => {
    getDeployment.mockResolvedValueOnce(detail({}, "pull"));
    const { result } = renderHook(() => useDeployment("web", 1));
    await flush();
    expect(stream().url).toBe("/api/apps/web/deployments/1/stream");
    act(() => stream().emitNamed("deployment", JSON.stringify(detail({}, "health"))));
    expect(result.current.deployment?.currentStep).toBe("health");
    act(() => stream().emitNamed("deployment", "{not json"));
    expect(result.current.deployment?.currentStep).toBe("health");
    act(() => stream().emitNamed("deployment", JSON.stringify(detail({ status: "failed", reason: "boom" }))));
    expect(result.current.deployment?.status).toBe("failed");
    expect(stream().closed).toBe(true);
  });

  it("falls back to polling when the stream fails, until the deploy finishes", async () => {
    getDeployment.mockResolvedValueOnce(detail({}, "pull"));
    const { result } = renderHook(() => useDeployment("web", 1));
    await flush();
    act(() => stream().emitError());
    expect(stream().closed).toBe(true);
    getDeployment.mockRejectedValueOnce(ApiError.network(new Error("503")));
    await act(async () => vi.advanceTimersByTimeAsync(DEPLOY_POLL_MS));
    await flush();
    expect(result.current.error?.kind).toBe("network");
    getDeployment.mockResolvedValueOnce(detail());
    await act(async () => vi.advanceTimersByTimeAsync(DEPLOY_POLL_MS));
    await flush();
    expect(result.current.deployment?.status).toBe("succeeded");
    expect(result.current.error).toBeUndefined();
    const calls = getDeployment.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(DEPLOY_POLL_MS * 3));
    expect(getDeployment.mock.calls.length).toBe(calls);
  });

  it("reports a 404 as not_found", async () => {
    getDeployment.mockRejectedValueOnce(new ApiError(404, { ok: false, error: "deployment not found" }));
    const { result } = renderHook(() => useDeployment("web", 9));
    await flush();
    expect(result.current.error?.kind).toBe("not_found");
    expect(result.current.loading).toBe(false);
  });

  it("closes the stream on unmount", async () => {
    getDeployment.mockResolvedValueOnce(detail({}, "pull"));
    const { unmount } = renderHook(() => useDeployment("web", 1));
    await flush();
    unmount();
    expect(stream().closed).toBe(true);
  });
});
