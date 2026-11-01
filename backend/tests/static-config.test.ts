import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { buildApp } from "../src/app.js";
import { resolvePublicDir } from "../src/plugins/static.js";
import { authHeader, testConfig } from "./helpers/test-config.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pier-static-config-"));
after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

describe("static configuration", () => {
  it("resolves default public dir next to dist (container path)", () => {
    // With no arg, resolvePublicDir should point to ../public from the caller.
    // In tests, this is the source tree; in production, it's the bundled dist/index.js.
    const publicDir = resolvePublicDir();
    assert.ok(publicDir.includes("public"));
    assert.ok(!publicDir.includes("node_modules"));
  });

  it("resolves custom public dir when provided", () => {
    const customDir = path.join(tempDir, "custom-public");
    const resolved = resolvePublicDir(customDir);
    assert.equal(resolved, path.resolve(customDir));
  });

  it("respects X-Forwarded-Proto with trustProxy enabled", async () => {
    const publicDir = path.join(tempDir, "public-trust");
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, "index.html"), "<!DOCTYPE html><html></html>");

    const config = testConfig({ trustProxy: true });
    const k8sClients = {
      mode: "kubeconfig" as const,
      core: { listNode: async () => ({ items: [] }) } as never,
      version: { getCode: async () => ({ gitVersion: "v1.36.5+k3s1" }) } as never,
      apps: { listNamespacedDeployment: async () => ({ items: [] }) } as never,
      networking: { listNamespacedIngress: async () => ({ items: [] }) } as never,
      log: {} as never,
    };
    const app = await buildApp(config, {
      logger: false,
      publicDir,
      k8s: { ok: true, clients: k8sClients },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: {
        "x-forwarded-proto": "https",
        "content-type": "application/json",
      },
      payload: JSON.stringify({ token: config.apiToken }),
    });

    assert.equal(res.statusCode, 204);
    const setCookieHeader = res.headers["set-cookie"] as string;
    assert.ok(setCookieHeader);
    assert.ok(setCookieHeader.includes("Secure"), "cookie should have Secure flag with HTTPS");

    await app.close();
  });

  it("rejects POST /api/apps with reserved dashboard host", async () => {
    const publicDir = path.join(tempDir, "public-host");
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, "index.html"), "<!DOCTYPE html><html></html>");

    const dashboardHost = "pier.example.com";
    const config = testConfig({ dashboardHost });
    const k8sClients = {
      mode: "kubeconfig" as const,
      core: { listNode: async () => ({ items: [] }) } as never,
      version: { getCode: async () => ({ gitVersion: "v1.36.5+k3s1" }) } as never,
      apps: { listNamespacedDeployment: async () => ({ items: [] }) } as never,
      networking: { listNamespacedIngress: async () => ({ items: [] }) } as never,
      log: {} as never,
    };
    const app = await buildApp(config, {
      logger: false,
      publicDir,
      k8s: { ok: true, clients: k8sClients },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: { ...authHeader, "content-type": "application/json" },
      payload: JSON.stringify({
        name: "test-app",
        image: "nginx:latest",
        port: 80,
        replicas: 1,
        host: dashboardHost,
      }),
    });

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json(), { ok: false, error: "host already in use" });

    await app.close();
  });

  it("allows other hosts when dashboard host is set", async () => {
    const publicDir = path.join(tempDir, "public-other");
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, "index.html"), "<!DOCTYPE html><html></html>");

    const dashboardHost = "pier.example.com";
    const config = testConfig({ dashboardHost, ingressDomain: "example.com" });
    const k8sClients = {
      mode: "kubeconfig" as const,
      core: { listNode: async () => ({ items: [] }) } as never,
      version: { getCode: async () => ({ gitVersion: "v1.36.5+k3s1" }) } as never,
      apps: {
        listNamespacedDeployment: async () => ({ items: [] }),
        createNamespacedDeployment: async () => ({}),
        createNamespacedService: async () => ({}),
        patchNamespacedDeployment: async () => ({}),
      } as never,
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        createNamespacedIngress: async () => ({}),
      } as never,
      log: {} as never,
    };
    const app = await buildApp(config, {
      logger: false,
      publicDir,
      k8s: { ok: true, clients: k8sClients },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: JSON.stringify({
        name: "test-app",
        image: "nginx:latest",
        port: 80,
        replicas: 1,
        host: "myapp.example.com",
      }),
    });

    assert.notEqual(res.statusCode, 409, "should not reject non-dashboard host");

    await app.close();
  });
});
