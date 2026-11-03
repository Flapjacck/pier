import { describe, it, expect, beforeEach, vi } from "vitest";
import { updateApp } from "../../src/api/client";
import { parseApp } from "../../src/api/guards";
import { ApiError } from "../../src/api/errors";

const resources = {
  requests: { cpu: "50m", memory: "64Mi" },
  limits: { cpu: "500m", memory: "256Mi" },
};

const appJson = {
  name: "hello",
  image: "nginx:1.28",
  replicas: 1,
  ready: 0,
  status: "building",
  createdAt: "2026-11-02T15:00:00.000Z",
  port: 8080,
  env: { A: "1" },
  resources,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("parseApp env/resources", () => {
  it("keeps valid env and resources", () => {
    const app = parseApp(appJson);
    expect(app.env).toEqual({ A: "1" });
    expect(app.resources).toEqual(resources);
  });

  it("drops malformed env and resources instead of throwing", () => {
    const app = parseApp({ ...appJson, env: { A: 1 }, resources: { requests: resources.requests } });
    expect(app.env).toBeUndefined();
    expect(app.resources).toBeUndefined();
  });
});

describe("updateApp", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("PATCHes the app and parses the result", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(appJson));
    const app = await updateApp("hello", { image: "nginx:1.28" });
    expect(app.image).toBe("nginx:1.28");
    expect(fetch).toHaveBeenCalledWith(
      "/api/apps/hello",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ image: "nginx:1.28" }) }),
    );
  });

  it("surfaces quota errors with details", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ ok: false, error: "quota exceeded", details: "limits.memory: needs 3Gi, quota 2Gi" }, 403),
    );
    const err = await updateApp("hello", { resources }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    if (err instanceof ApiError) expect(err.details).toMatch(/limits.memory/);
  });
});
