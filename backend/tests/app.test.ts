import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { buildApp } from "../src/app.js";
import { countingLoader } from "./helpers/fake-kubeconfig-loader.js";
import { authHeader, testConfig } from "./helpers/test-config.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pier-app-"));
after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

/** A broken kubeconfig whose second line looks like a secret, to catch log leaks. */
function badKubeconfigFile(): string {
  const file = path.join(tempDir, "bad-kubeconfig.yaml");
  fs.writeFileSync(file, "not yaml: [\n  token: super-secret-value\n");
  return file;
}

describe("buildApp k8s clients", () => {
  it("loads the kubeconfig once across several requests", async () => {
    const loader = countingLoader({
      core: {
        listNode: async () => ({ items: [] }),
        listNamespacedPod: async () => ({ items: [] }),
      } as never,
      version: { getCode: async () => ({ gitVersion: "v1.36.5+k3s1" }) } as never,
      apps: { listNamespacedDeployment: async () => ({ items: [] }) } as never,
    });
    const app = buildApp(testConfig(), { logger: false, loadKubeConfig: loader.load });

    for (const url of ["/cluster/health", "/cluster/pods", "/apps"]) {
      const res = await app.inject({ method: "GET", url, headers: authHeader });
      assert.equal(res.statusCode, 200, url);
    }
    assert.equal(loader.calls(), 1);
    await app.close();
  });

  it("returns 503 on cluster and app routes but 200 on /health with a bad kubeconfig", async () => {
    const app = buildApp(testConfig({ kubeconfig: badKubeconfigFile() }), { logger: false });

    for (const url of ["/cluster/health", "/cluster/pods", "/apps"]) {
      const res = await app.inject({ method: "GET", url, headers: authHeader });
      assert.equal(res.statusCode, 503, url);
      assert.deepEqual(res.json(), { ok: false, error: "cluster unreachable" });
    }
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    await app.close();
  });

  it("logs a one-line startup warning without kubeconfig content", async () => {
    const lines: string[] = [];
    const app = buildApp(testConfig({ kubeconfig: badKubeconfigFile() }), {
      logger: { level: "warn", stream: { write: (line: string) => lines.push(line) } },
    });
    await app.ready();

    const warning = lines
      .map((line) => JSON.parse(line) as { msg: string })
      .find((entry) => entry.msg.startsWith("cluster unreachable at startup"));
    assert.ok(warning, "expected a startup warning");
    assert.ok(!warning.msg.includes("\n"));
    assert.ok(!warning.msg.includes("super-secret-value"));
    await app.close();
  });
});
