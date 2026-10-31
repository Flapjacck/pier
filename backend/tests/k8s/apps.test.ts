import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppsV1Api, NetworkingV1Api, V1Deployment } from "@kubernetes/client-node";
import {
  deploymentToApp,
  deriveStatus,
  listApps,
} from "../../src/k8s/apps.js";
import { APP_LABEL } from "../../src/k8s/labels.js";

function deployFixture(partial: Record<string, unknown>): V1Deployment {
  return partial as unknown as V1Deployment;
}

function baseDeploy(overrides: Record<string, unknown> = {}): V1Deployment {
  return deployFixture({
    metadata: {
      name: "hello",
      generation: 1,
      creationTimestamp: new Date("2026-10-29T15:00:00.000Z"),
      labels: { [APP_LABEL]: "hello" },
    },
    spec: {
      replicas: 2,
      template: {
        spec: {
          containers: [{ image: "nginx:1.27" }],
        },
      },
    },
    status: {
      observedGeneration: 1,
      replicas: 2,
      readyReplicas: 2,
      updatedReplicas: 2,
      conditions: [
        { type: "Progressing", status: "True", reason: "NewReplicaSetAvailable" },
        { type: "Available", status: "True" },
      ],
    },
    ...overrides,
  });
}

describe("deriveStatus", () => {
  it("returns running when all replicas are ready and observed", () => {
    assert.equal(deriveStatus(baseDeploy()), "running");
  });

  it("returns stopped when replicas is 0", () => {
    const d = baseDeploy({
      spec: { replicas: 0, template: { spec: { containers: [{ image: "x" }] } } },
      status: { readyReplicas: 0, updatedReplicas: 0, replicas: 0 },
    });
    assert.equal(deriveStatus(d), "stopped");
  });

  it("returns building when ready is below replicas", () => {
    const d = baseDeploy({
      status: {
        observedGeneration: 1,
        readyReplicas: 0,
        updatedReplicas: 1,
        replicas: 1,
      },
    });
    assert.equal(deriveStatus(d), "building");
  });

  it("returns building when updatedReplicas lags replicas", () => {
    const d = baseDeploy({
      status: {
        observedGeneration: 1,
        readyReplicas: 2,
        updatedReplicas: 1,
        replicas: 2,
      },
    });
    assert.equal(deriveStatus(d), "building");
  });

  it("returns building when observedGeneration is behind metadata.generation", () => {
    const d = baseDeploy({
      metadata: { generation: 3, labels: { [APP_LABEL]: "hello" } },
      status: {
        observedGeneration: 1,
        readyReplicas: 2,
        updatedReplicas: 2,
      },
    });
    assert.equal(deriveStatus(d), "building");
  });

  it("returns failed on ProgressDeadlineExceeded", () => {
    const d = baseDeploy({
      status: {
        conditions: [
          {
            type: "Progressing",
            status: "False",
            reason: "ProgressDeadlineExceeded",
          },
          { type: "Available", status: "False" },
        ],
      },
    });
    assert.equal(deriveStatus(d), "failed");
  });

  it("returns failed when Available=False and Progressing is not True", () => {
    const d = baseDeploy({
      status: {
        conditions: [
          { type: "Progressing", status: "False", reason: "ReplicaSetUpdated" },
          { type: "Available", status: "False" },
        ],
      },
    });
    assert.equal(deriveStatus(d), "failed");
  });

  it("does not crash when status fields are missing", () => {
    const d = deployFixture({
      metadata: { name: "bare" },
      spec: { template: { spec: { containers: [] } } },
    });
    assert.equal(deriveStatus(d), "building");
    assert.doesNotThrow(() => deploymentToApp(d));
  });
});

describe("deploymentToApp", () => {
  it("uses pier.app label for name", () => {
    const d = baseDeploy({
      metadata: { name: "deploy-xyz", labels: { [APP_LABEL]: "my-app" } },
    });
    assert.equal(deploymentToApp(d).name, "my-app");
  });

  it("reads image from the first container", () => {
    assert.equal(deploymentToApp(baseDeploy()).image, "nginx:1.27");
  });

  it("returns createdAt as ISO string", () => {
    const app = deploymentToApp(baseDeploy());
    assert.equal(app.createdAt, "2026-10-29T15:00:00.000Z");
  });

  it("extracts port from http named port, omits host/url when no host provided", () => {
    const d = baseDeploy({
      spec: {
        replicas: 1,
        template: {
          spec: {
            containers: [
              {
                image: "nginx:1.27",
                ports: [{ name: "http", containerPort: 8080 }],
              },
            ],
          },
        },
      },
    });
    const app = deploymentToApp(d);
    assert.equal(app.port, 8080);
    assert.equal("host" in app, false);
    assert.equal("url" in app, false);
  });

  it("includes host and url when host is provided", () => {
    const d = baseDeploy({
      spec: {
        replicas: 1,
        template: {
          spec: {
            containers: [
              {
                image: "nginx:1.27",
                ports: [{ name: "http", containerPort: 8080 }],
              },
            ],
          },
        },
      },
    });
    const app = deploymentToApp(d, "hello.192.0.2.10.nip.io");
    assert.equal(app.port, 8080);
    assert.equal(app.host, "hello.192.0.2.10.nip.io");
    assert.equal(app.url, "http://hello.192.0.2.10.nip.io");
  });
});

describe("listApps", () => {
  it("passes pier.app labelSelector and sorts by name", async () => {
    let capturedDeploySelector: string | undefined;
    let capturedIngressSelector: string | undefined;
    let ingressCallCount = 0;
    const zebra = baseDeploy({
      metadata: { name: "z", labels: { [APP_LABEL]: "zebra" } },
    });
    const alpha = baseDeploy({
      metadata: { name: "a", labels: { [APP_LABEL]: "alpha" } },
    });

    const fakeApis = {
      apps: {
        listNamespacedDeployment: async (params: {
          namespace: string;
          labelSelector?: string;
        }) => {
          capturedDeploySelector = params.labelSelector;
          assert.equal(params.namespace, "pier-apps");
          return { items: [zebra, alpha] };
        },
      } as unknown as AppsV1Api,
      networking: {
        listNamespacedIngress: async (params: {
          namespace: string;
          labelSelector?: string;
        }) => {
          ingressCallCount++;
          capturedIngressSelector = params.labelSelector;
          assert.equal(params.namespace, "pier-apps");
          return { items: [] };
        },
      } as unknown as NetworkingV1Api,
    };

    const apps = await listApps(fakeApis, "pier-apps");
    assert.equal(capturedDeploySelector, "pier.app");
    assert.equal(capturedIngressSelector, "app.kubernetes.io/managed-by=pier");
    assert.equal(ingressCallCount, 1);
    assert.deepEqual(
      apps.map((a) => a.name),
      ["alpha", "zebra"],
    );
  });
});
