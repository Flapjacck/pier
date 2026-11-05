import { beforeEach, describe, expect, it, vi } from "vitest";
import { deploymentStreamUrl, getDeployment, listDeployments } from "../../src/api/client";
import { detail, summary } from "../helpers/deploys";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("deploy client", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("lists deployments with limit and before", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(() => Promise.resolve(ok({ ok: true, deployments: [summary()], nextBefore: null })));
    await listDeployments("my app");
    await listDeployments("web", { limit: 5, before: 12 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/apps/my%20app/deployments");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/apps/web/deployments?limit=5&before=12");
  });

  it("gets one deployment", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(ok({ ok: true, deployment: detail() }));
    const d = await getDeployment("web", 4);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/apps/web/deployments/4");
    expect(d.steps).toHaveLength(7);
  });

  it("builds the stream URL", () => {
    expect(deploymentStreamUrl("my app", 3)).toBe("/api/apps/my%20app/deployments/3/stream");
  });
});
