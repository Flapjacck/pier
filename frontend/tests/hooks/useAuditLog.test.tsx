import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/errors";
import type { AuditEntry, AuditPage } from "../../src/api/types";
import { AUDIT_PAGE_SIZE, useAuditLog } from "../../src/hooks/useAuditLog";

const { listAudit } = vi.hoisted(() => ({ listAudit: vi.fn() }));
vi.mock("../../src/api/client", () => ({ listAudit }));

const row = (id: number, app = "web"): AuditEntry => ({
  id, ts: "2026-11-04T12:00:00.000Z", actor: "token", ip: "192.0.2.1", action: "app.restart",
  app, target: null, status: 202, details: {},
});
const page = (ids: number[], nextBefore: number | null): AuditPage => ({ entries: ids.map((id) => row(id)), nextBefore });

describe("useAuditLog", () => {
  beforeEach(() => listAudit.mockReset());

  it("loads the newest page, then appends older pages with loadMore", async () => {
    listAudit.mockResolvedValueOnce(page([5, 4], 4)).mockResolvedValueOnce(page([3], null));
    const { result } = renderHook(() => useAuditLog());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.id)).toEqual([5, 4]);
    expect(result.current.hasMore).toBe(true);
    expect(listAudit).toHaveBeenLastCalledWith({ limit: AUDIT_PAGE_SIZE, app: undefined }, expect.anything());

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.entries.map((e) => e.id)).toEqual([5, 4, 3]));
    expect(listAudit).toHaveBeenLastCalledWith({ limit: AUDIT_PAGE_SIZE, before: 4, app: undefined }, expect.anything());
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
  });

  it("passes the app filter and starts over when it changes", async () => {
    listAudit.mockResolvedValueOnce(page([9], null)).mockResolvedValueOnce(page([2], null));
    const { result, rerender } = renderHook(({ app }) => useAuditLog(app), { initialProps: { app: "web" } });
    await waitFor(() => expect(result.current.entries.map((e) => e.id)).toEqual([9]));
    expect(listAudit).toHaveBeenLastCalledWith({ limit: AUDIT_PAGE_SIZE, app: "web" }, expect.anything());
    rerender({ app: "api" });
    await waitFor(() => expect(result.current.entries.map((e) => e.id)).toEqual([2]));
    expect(listAudit).toHaveBeenLastCalledWith({ limit: AUDIT_PAGE_SIZE, app: "api" }, expect.anything());
  });

  it("surfaces errors and recovers on refetch", async () => {
    listAudit.mockRejectedValueOnce(new ApiError(500, { ok: false, error: "audit log unavailable" })).mockResolvedValueOnce(page([1], null));
    const { result } = renderHook(() => useAuditLog());
    await waitFor(() => expect(result.current.error?.message).toBe("audit log unavailable"));
    expect(result.current.entries).toEqual([]);
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.entries.map((e) => e.id)).toEqual([1]));
    expect(result.current.error).toBeUndefined();
  });

  it("keeps loaded entries when loading more fails", async () => {
    listAudit.mockResolvedValueOnce(page([5], 5)).mockRejectedValueOnce(new TypeError("offline"));
    const { result } = renderHook(() => useAuditLog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error?.kind).toBe("network"));
    expect(result.current.entries.map((e) => e.id)).toEqual([5]);
    expect(result.current.hasMore).toBe(true);
  });
});
