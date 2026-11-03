import assert from "node:assert/strict";
import test from "node:test";
import { createFakeClients } from "../../helpers/fake-clients.js";
import { listAttachments } from "../../../src/k8s/volumes/attachments.js";

test("maps mounts to apps and skips terminating deployments", async () => {
  const clients = createFakeClients();
  Object.assign(clients.apps, {
    listNamespacedDeployment: async () => ({ items: [
      { metadata: { labels: { "pier.app": "web" } }, spec: { template: { spec: {
        volumes: [{ name: "vol-data", persistentVolumeClaim: { claimName: "data" } }],
        containers: [{ name: "app", volumeMounts: [{ name: "vol-data", mountPath: "/data" }] }],
      } } } },
      { metadata: { labels: { "pier.app": "gone" }, deletionTimestamp: "now" }, spec: { template: { spec: {
        volumes: [{ name: "vol-old", persistentVolumeClaim: { claimName: "old" } }],
        containers: [{ name: "app", volumeMounts: [{ name: "vol-old", mountPath: "/old" }] }],
      } } } },
    ] }),
  });
  const attachments = await listAttachments(clients.apps, "pier-apps");
  assert.deepEqual(attachments.get("data"), { app: "web", mountPath: "/data" });
  assert.equal(attachments.has("old"), false);
});
