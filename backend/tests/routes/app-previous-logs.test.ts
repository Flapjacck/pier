import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

describe("previous pod logs", () => {
  it("requests previous logs for an app-owned pod", async () => {
    let previous = false;
    const app = await buildApp(testConfig(), {
      logger: false,
      k8s: createFakeClientsResult({
        apps: { readNamespacedDeployment: async () => ({ metadata: { labels: { "pier.app": "hello" } } }) } as never,
        core: { listNamespacedPod: async () => ({ items: [{ metadata: { name: "hello-pod" } }] }) } as never,
        log: {
          log: async (_namespace: string, _pod: string, _container: string, stream: PassThrough, options: { previous?: boolean }) => {
            previous = options.previous === true;
            stream.end("crashed");
            return new AbortController();
          },
        } as never,
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/apps/hello/logs?pod=hello-pod&previous=true",
      headers: authHeader,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "crashed");
    assert.equal(previous, true);
    await app.close();
  });
});
