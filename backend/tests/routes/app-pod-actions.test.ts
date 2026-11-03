import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

describe("pod actions", () => {
  it("deletes a pod belonging to the app", async () => {
    let deleted = "";
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: { readNamespacedDeployment: async () => ({ metadata: { labels: { "pier.app": "hello" } } }) } as never,
        core: {
          listNamespacedPod: async () => ({ items: [{ metadata: { name: "hello-pod" } }] }),
          deleteNamespacedPod: async (params: { name: string }) => { deleted = params.name; },
        } as never,
      }),
    });
    const response = await app.inject({ method: "DELETE", url: "/api/apps/hello/pods/hello-pod", headers: authHeader });
    assert.equal(response.statusCode, 202);
    assert.equal(deleted, "hello-pod");
    await app.close();
  });

  it("returns 404 for a pod belonging to another app", async () => {
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: { readNamespacedDeployment: async () => ({ metadata: { labels: { "pier.app": "hello" } } }) } as never,
        core: { listNamespacedPod: async () => ({ items: [] }) } as never,
      }),
    });
    const response = await app.inject({ method: "DELETE", url: "/api/apps/hello/pods/other-pod", headers: authHeader });
    assert.equal(response.statusCode, 404);
    await app.close();
  });
});
