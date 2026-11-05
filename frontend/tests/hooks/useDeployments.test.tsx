import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEPLOYS_PAGE_SIZE, DEPLOYS_REFRESH_MS, useDeployments } from "../../src/hooks/useDeployments";
import { summary } from "../helpers/deploys";

const { listDeployments } = vi.hoisted(() => ({ listDeployments: vi.fn() }));
vi.mock("../../src/api/client", () => ({ listDeployments }));

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

const ids = (list: { id: number }[]) => list.map((d) => d.id);

describe("useDeployments", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listDeployments.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("loads the first page and appends older pages without duplicates", async () => {
    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 3 }), summary({ id: 2 })], nextBefore: 2 });
    const { result } = renderHook(() => useDeployments("web"));
    await flush();
    expect(listDeployments).toHaveBeenCalledWith("web", { limit: DEPLOYS_PAGE_SIZE }, expect.anything());
    expect(ids(result.current.deployments)).toEqual([3, 2]);
    expect(result.current.hasMore).toBe(true);

    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 1 })], nextBefore: null });
    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await flush();
    expect(listDeployments).toHaveBeenCalledTimes(2);
    expect(listDeployments).toHaveBeenLastCalledWith("web", { limit: DEPLOYS_PAGE_SIZE, before: 2 }, expect.anything());
    expect(ids(result.current.deployments)).toEqual([3, 2, 1]);
    expect(result.current.hasMore).toBe(false);
  });

  it("refreshes the first page while a deploy is running, keeping older pages", async () => {
    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 3, status: "running" }), summary({ id: 2 })], nextBefore: 2 });
    const { result } = renderHook(() => useDeployments("web"));
    await flush();
    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 1 })], nextBefore: null });
    act(() => result.current.loadMore());
    await flush();
    expect(ids(result.current.deployments)).toEqual([3, 2, 1]);

    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 4, status: "running" }), summary({ id: 3, status: "cancelled" })], nextBefore: 3 });
    await act(async () => vi.advanceTimersByTimeAsync(DEPLOYS_REFRESH_MS));
    await flush();
    expect(ids(result.current.deployments)).toEqual([4, 3, 2, 1]);
    expect(result.current.deployments[1]?.status).toBe("cancelled");
  });

  it("does not refresh when nothing is running", async () => {
    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 1 })], nextBefore: null });
    renderHook(() => useDeployments("web"));
    await flush();
    await act(async () => vi.advanceTimersByTimeAsync(DEPLOYS_REFRESH_MS * 3));
    expect(listDeployments).toHaveBeenCalledTimes(1);
  });

  it("reports errors and refetches on demand", async () => {
    listDeployments.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useDeployments("web"));
    await flush();
    expect(result.current.error?.kind).toBe("network");
    listDeployments.mockResolvedValueOnce({ deployments: [summary({ id: 1 })], nextBefore: null });
    act(() => result.current.refetch());
    await flush();
    expect(result.current.error).toBeUndefined();
    expect(ids(result.current.deployments)).toEqual([1]);
  });
});
