import { describe, it, expect } from "vitest";
import type { App } from "../../src/api/types";
import { buildUpdateBody, configValuesFromApp, describeChanges } from "../../src/lib/appConfig";
import { DEFAULT_RESOURCES, setResourceField } from "../../src/lib/resources";

const app: App = {
  name: "hello",
  image: "nginx:1.27",
  replicas: 1,
  ready: 1,
  status: "running",
  createdAt: "2026-11-02T15:00:00.000Z",
  port: 8080,
  env: { A: "1" },
  resources: DEFAULT_RESOURCES,
};

describe("buildUpdateBody", () => {
  it("is unchanged for the app's own values", () => {
    expect(buildUpdateBody(app, configValuesFromApp(app))).toEqual({ ok: true, body: {}, changed: false });
  });

  it("sends only the fields that changed", () => {
    const values = { ...configValuesFromApp(app), image: " nginx:1.28 ", port: "3000" };
    expect(buildUpdateBody(app, values)).toEqual({
      ok: true,
      body: { image: "nginx:1.28", port: 3000 },
      changed: true,
    });
  });

  it("sends the whole env map when any key changes, and {} to clear it", () => {
    const base = configValuesFromApp(app);
    const added = { ...base, env: [...base.env, { id: "9", key: "B", value: "2" }] };
    expect(buildUpdateBody(app, added)).toMatchObject({ body: { env: { A: "1", B: "2" } } });
    const cleared = { ...base, env: [] };
    expect(buildUpdateBody(app, cleared)).toMatchObject({ body: { env: {} } });
  });

  it("sends full resources when they change", () => {
    const resources = setResourceField(DEFAULT_RESOURCES, "limits.memory", "1Gi");
    const result = buildUpdateBody(app, { ...configValuesFromApp(app), resources });
    expect(result).toMatchObject({ ok: true, body: { resources } });
  });

  it("clears a registry with null", () => {
    const withRegistry: App = { ...app, registry: "ghcr" };
    expect(buildUpdateBody(withRegistry, { ...configValuesFromApp(withRegistry), registry: "" }))
      .toMatchObject({ ok: true, body: { registry: null } });
  });

  it("treats a backend without resources as the defaults", () => {
    const legacy: App = { ...app, resources: undefined };
    expect(buildUpdateBody(legacy, configValuesFromApp(legacy))).toMatchObject({ changed: false });
  });

  it("returns field errors instead of a body", () => {
    const values = {
      ...configValuesFromApp(app),
      image: "",
      port: "70000",
      resources: setResourceField(DEFAULT_RESOURCES, "limits.cpu", "10m"),
    };
    const result = buildUpdateBody(app, values);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.image).toBe("Image is required");
      expect(result.errors.port).toMatch(/between 1 and 65535/);
      expect(result.errors.resources?.["limits.cpu"]).toMatch(/at least the CPU request/);
    }
  });
});

describe("describeChanges", () => {
  it("lists what will change", () => {
    expect(describeChanges({ image: "x:1", env: { A: "1" }, resources: DEFAULT_RESOURCES })).toBe(
      "image → x:1, 1 env var(s), CPU & memory",
    );
  });
});
