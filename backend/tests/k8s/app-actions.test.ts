import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppsV1Api, CoreV1Api, NetworkingV1Api } from "@kubernetes/client-node";
import { deleteApp, restartApp, scaleApp } from "../../src/k8s/app-actions.js";
import { VolumesReplicaError } from "../../src/k8s/volumes/errors.js";
import { APP_LABEL } from "../../src/k8s/labels.js";
import { FakeApiError } from "../helpers/fake-clients.js";

const liveDeployment = {
  metadata: {
    name: "hello",
    labels: { [APP_LABEL]: "hello" },
  },
  spec: {
    template: {
      metadata: {
        annotations: { "some.other/annotation": "keep" },
      },
    },
  },
};

describe("restartApp", () => {
  it("uses JSON Patch add for restartedAt when annotations exist", async () => {
    let patchBody: unknown;
    let patchCalled = false;
    const apps = {
      readNamespacedDeployment: async () => liveDeployment,
      patchNamespacedDeployment: async (param: { body: unknown }, options?: unknown) => {
        patchBody = param.body;
        patchCalled = options !== undefined;
        return liveDeployment;
      },
    } as unknown as AppsV1Api;

    await restartApp(apps, "pier-apps", "hello", new Date("2026-01-01T00:00:00.000Z"));

    assert.deepEqual(patchBody, [
      {
        op: "add",
        path: "/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt",
        value: "2026-01-01T00:00:00.000Z",
      },
    ]);
    assert.equal(patchCalled, true);
  });

  it("uses JSON Patch add for annotations object when absent", async () => {
    let patchBody: unknown;
    const apps = {
      readNamespacedDeployment: async () => ({
        metadata: { labels: { [APP_LABEL]: "hello" } },
        spec: { template: { metadata: {} } },
      }),
      patchNamespacedDeployment: async (param: { body: unknown }) => {
        patchBody = param.body;
        return liveDeployment;
      },
    } as unknown as AppsV1Api;

    await restartApp(apps, "pier-apps", "hello", new Date("2026-01-02T00:00:00.000Z"));

    assert.deepEqual(patchBody, [
      {
        op: "add",
        path: "/spec/template/metadata/annotations",
        value: { "kubectl.kubernetes.io/restartedAt": "2026-01-02T00:00:00.000Z" },
      },
    ]);
  });
});

describe("deleteApp", () => {
  const volumeDeployment = {
    metadata: { name: "hello", labels: { [APP_LABEL]: "hello" } },
    spec: { template: { spec: {
      volumes: [{ name: "vol-data", persistentVolumeClaim: { claimName: "data" } }],
      containers: [{ name: "app", volumeMounts: [{ name: "vol-data", mountPath: "/data" }] }],
    } } },
  };

  it("keeps a PVC by default and removes its app label", async () => {
    let unlabelled = false;
    const clients = {
      apps: { readNamespacedDeployment: async () => volumeDeployment, deleteNamespacedDeployment: async () => undefined },
      core: {
        deleteNamespacedService: async () => undefined,
        patchNamespacedPersistentVolumeClaim: async () => { unlabelled = true; },
      },
      networking: { deleteNamespacedIngress: async () => undefined },
    } as unknown as { apps: AppsV1Api; core: CoreV1Api; networking: NetworkingV1Api };
    await deleteApp(clients, "pier-apps", "hello");
    assert.equal(unlabelled, true);
  });

  it("deletes a volume after a terminating Deployment and reports cleanup errors", async () => {
    const clients = {
      apps: { readNamespacedDeployment: async () => volumeDeployment, deleteNamespacedDeployment: async () => undefined },
      core: {
        deleteNamespacedService: async () => undefined,
        readNamespacedPersistentVolumeClaim: async () => ({ metadata: { labels: { "app.kubernetes.io/managed-by": "pier" } } }),
        deleteNamespacedPersistentVolumeClaim: async () => { throw new Error("blocked"); },
      },
      networking: { deleteNamespacedIngress: async () => undefined },
    } as unknown as { apps: AppsV1Api; core: CoreV1Api; networking: NetworkingV1Api };
    const result = await deleteApp(clients, "pier-apps", "hello", true);
    assert.equal(result.volumeErrors.length, 1);
    assert.deepEqual(result.deleted, ["deployment", "service", "ingress"]);
  });

  it("rejects scaling a volume app above one replica", async () => {
    const apps = {
      readNamespacedDeployment: async () => volumeDeployment,
    } as unknown as AppsV1Api;
    await assert.rejects(scaleApp(apps, "pier-apps", "hello", 2), VolumesReplicaError);
  });

  it("tolerates 404 on each resource when deleting a live app", async () => {
    const clients = {
      apps: {
        readNamespacedDeployment: async () => liveDeployment,
        deleteNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
      },
      core: {
        deleteNamespacedService: async () => {
          throw new FakeApiError(404);
        },
      },
      networking: {
        deleteNamespacedIngress: async () => {
          throw new FakeApiError(404);
        },
      },
    } as unknown as { apps: AppsV1Api; core: CoreV1Api; networking: NetworkingV1Api };

    const result = await deleteApp(clients, "pier-apps", "hello");
    assert.deepEqual(result.deleted, []);
  });

  it("orphan cleanup only deletes labelled Service and Ingress", async () => {
    let serviceDeleted = false;
    let ingressDeleted = false;

    const clients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
      },
      core: {
        readNamespacedService: async () => ({
          metadata: { labels: { [APP_LABEL]: "hello" } },
        }),
        deleteNamespacedService: async () => {
          serviceDeleted = true;
        },
      },
      networking: {
        readNamespacedIngress: async () => ({
          metadata: { labels: { [APP_LABEL]: "other" } },
        }),
        deleteNamespacedIngress: async () => {
          ingressDeleted = true;
        },
      },
    } as unknown as { apps: AppsV1Api; core: CoreV1Api; networking: NetworkingV1Api };

    const result = await deleteApp(clients, "pier-apps", "hello");
    assert.equal(serviceDeleted, true);
    assert.equal(ingressDeleted, false);
    assert.deepEqual(result.deleted, ["service"]);
  });
});
