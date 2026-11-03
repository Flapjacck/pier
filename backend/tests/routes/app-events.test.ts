import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

describe("GET /api/apps/:name/events", () => {
  it("returns filtered events in the documented shape", async () => {
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: {
          readNamespacedDeployment: async () => ({ metadata: { name: "hello", uid: "deployment-uid", labels: { "pier.app": "hello" } } }),
          listNamespacedReplicaSet: async () => ({ items: [{ metadata: { name: "hello-rs", uid: "rs-uid" } }] }),
        } as never,
        core: {
          listNamespacedPod: async () => ({ items: [{ metadata: { name: "hello-rs-old", uid: "pod-uid" } }] }),
          listNamespacedEvent: async () => ({
            items: [{
              type: "Warning",
              reason: "BackOff",
              message: "Back-off restarting failed container",
              count: 2,
              lastTimestamp: new Date("2026-01-01T00:00:00Z"),
              involvedObject: { kind: "Pod", name: "hello-rs-old", uid: "pod-uid" },
            }],
          }),
        } as never,
      }),
    });
    const response = await app.inject({ method: "GET", url: "/api/apps/hello/events", headers: authHeader });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().events[0].summary, "Kubernetes is backing off while restarting the crashed container.");
    await app.close();
  });
});
