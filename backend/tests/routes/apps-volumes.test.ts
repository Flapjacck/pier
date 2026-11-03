import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

test("app volume routes reject invalid mounts and invalid delete query values", async () => {
  const result = createFakeClientsResult();
  if (!result.ok) throw new Error("fake clients unavailable");
  Object.assign(result.clients.apps, {
    readNamespacedDeployment: async () => { throw Object.assign(new Error("not found"), { code: 404 }); },
  });
  Object.assign(result.clients.networking, { listNamespacedIngress: async () => ({ items: [] }) });
  const app = await buildApp(testConfig(), { logger: false, k8s: result });
  const invalid = await app.inject({
    method: "POST", url: "/api/apps", headers: authHeader,
    payload: { name: "web", image: "nginx:1.27", port: 80, volumes: [{ name: "data", mountPath: "/proc/x", size: "1Gi" }] },
  });
  assert.equal(invalid.statusCode, 400);
  const query = await app.inject({ method: "DELETE", url: "/api/apps/web?deleteVolumes=nope", headers: authHeader });
  assert.equal(query.statusCode, 400);
  await app.close();
});
