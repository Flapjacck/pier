import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult, createFailedClientsResult } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

test("volume routes return list success and cluster 503", async () => {
  const result = createFakeClientsResult();
  if (!result.ok) throw new Error("fake clients unavailable");
  Object.assign(result.clients.core, { listNamespacedPersistentVolumeClaim: async () => ({ items: [] }) });
  Object.assign(result.clients.apps, { listNamespacedDeployment: async () => ({ items: [] }) });
  const app = await buildApp(testConfig(), { logger: false, k8s: result });
  const ok = await app.inject({ method: "GET", url: "/api/volumes", headers: authHeader });
  assert.equal(ok.statusCode, 200);
  await app.close();
  const unavailable = await buildApp(testConfig(), { logger: false, k8s: createFailedClientsResult() });
  const failed = await unavailable.inject({ method: "GET", url: "/api/volumes", headers: authHeader });
  assert.equal(failed.statusCode, 503);
  await unavailable.close();
});

test("volume routes validate names, map missing volumes, and require auth", async () => {
  const result = createFakeClientsResult();
  if (!result.ok) throw new Error("fake clients unavailable");
  Object.assign(result.clients.core, { readNamespacedPersistentVolumeClaim: async () => ({ metadata: { name: "data" } }) });
  const app = await buildApp(testConfig(), { logger: false, k8s: result });
  assert.equal((await app.inject({ method: "GET", url: "/api/volumes/not valid", headers: authHeader })).statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: "/api/volumes/data", headers: authHeader })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/api/volumes" })).statusCode, 401);
  await app.close();
});
