import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVolume, deleteApp, deleteVolume, listVolumes } from "../../src/api/client";

describe("volume client", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  it("lists, creates, and deletes volumes with the expected requests", async () => {
    const fetchMock = vi.mocked(fetch);
    const volume = { name: "data", size: "1Gi", status: "bound", createdAt: "2025-01-01" };
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([volume]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(volume), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, dataRetained: false }), { status: 200 }));
    await listVolumes();
    await createVolume({ name: "data", size: "1Gi" });
    await deleteVolume("data");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/volumes");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/volumes");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/volumes/data");
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "DELETE" });
  });
  it("adds the deleteVolumes query", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, dataRetained: false, volumeErrors: [] }), { status: 200 }));
    await deleteApp("web", { deleteVolumes: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/apps/web?deleteVolumes=true");
  });
  it("treats a 204 app delete (volumes kept) as success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteApp("web")).resolves.toEqual({ ok: true, dataRetained: false, volumeErrors: [] });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/apps/web");
  });
});
