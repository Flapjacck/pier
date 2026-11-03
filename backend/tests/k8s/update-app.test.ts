import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { V1Deployment } from "@kubernetes/client-node";
import {
  AppNotFoundError,
  buildUpdateOps,
  InvalidResourcesError,
  updateApp,
} from "../../src/k8s/update-app.js";
import { VolumesReplicaError } from "../../src/k8s/volumes/errors.js";
import { DEFAULT_RESOURCES } from "../../src/k8s/resources.js";
import { FakeApiError } from "../helpers/fake-clients.js";

const C = "/spec/template/spec/containers/0";

function deployment(): V1Deployment {
  return {
    metadata: { name: "hello", labels: { "pier.app": "hello" } },
    spec: {
      replicas: 1,
      selector: {},
      template: {
        spec: {
          containers: [{ name: "app", image: "nginx:1.27", ports: [{ name: "http", containerPort: 8080 }] }],
        },
      },
    },
  };
}

type Call = { body: unknown };

function clients(opts: { live?: boolean; servicePatch?: () => Promise<unknown> } = {}) {
  const deploymentPatches: Call[] = [];
  const servicePatches: Call[] = [];
  const fake = {
    apps: {
      readNamespacedDeployment: async () => {
        if (opts.live === false) throw new FakeApiError(404);
        return deployment();
      },
      patchNamespacedDeployment: async (req: Call) => {
        deploymentPatches.push(req);
        return deployment();
      },
    },
    core: {
      listNamespacedLimitRange: async () => ({ items: [] }),
      listNamespacedResourceQuota: async () => ({ items: [] }),
      patchNamespacedService: async (req: Call) => {
        servicePatches.push(req);
        return opts.servicePatch ? opts.servicePatch() : {};
      },
    },
    networking: {
      readNamespacedIngress: async () => {
        throw new FakeApiError(404);
      },
    },
  };
  return { fake: fake as never, deploymentPatches, servicePatches };
}

describe("buildUpdateOps", () => {
  it("builds one op per changed field", () => {
    const ops = buildUpdateOps({ image: "nginx:1.28", env: { B: "2", A: "1" }, replicas: 3 });
    assert.deepEqual(ops, [
      { op: "replace", path: `${C}/image`, value: "nginx:1.28" },
      { op: "add", path: `${C}/env`, value: [{ name: "A", value: "1" }, { name: "B", value: "2" }] },
      { op: "add", path: "/spec/replicas", value: 3 },
    ]);
  });

  it("replaces ports and the readiness probe on a port change", () => {
    const ops = buildUpdateOps({ port: 3000 });
    assert.deepEqual(ops.map((o) => o.path), [`${C}/ports`, `${C}/readinessProbe`]);
    assert.deepEqual(ops[0]?.value, [{ name: "http", containerPort: 3000 }]);
    assert.deepEqual(ops[1]?.value, { tcpSocket: { port: 3000 }, initialDelaySeconds: 2, periodSeconds: 5 });
  });

  it("writes full container resources including ephemeral storage", () => {
    const ops = buildUpdateOps({}, DEFAULT_RESOURCES);
    assert.equal(ops.length, 1);
    assert.equal(ops[0]?.path, `${C}/resources`);
    assert.deepEqual(ops[0]?.value, {
      requests: { cpu: "50m", memory: "64Mi", "ephemeral-storage": "64Mi" },
      limits: { cpu: "500m", memory: "256Mi", "ephemeral-storage": "1Gi" },
    });
  });

  it("clears env with an empty map", () => {
    assert.deepEqual(buildUpdateOps({ env: {} }), [{ op: "add", path: `${C}/env`, value: [] }]);
  });
});

describe("updateApp", () => {
  it("patches the Deployment and the Service targetPort on a port change", async () => {
    const { fake, deploymentPatches, servicePatches } = clients();
    const app = await updateApp(fake, "pier-apps", "hello", { port: 3000 });
    assert.equal(app.name, "hello");
    assert.equal(deploymentPatches.length, 1);
    assert.deepEqual(servicePatches[0]?.body, [{ op: "replace", path: "/spec/ports/0/targetPort", value: 3000 }]);
  });

  it("leaves the Service alone when the port is unchanged", async () => {
    const { fake, servicePatches } = clients();
    await updateApp(fake, "pier-apps", "hello", { port: 8080, image: "nginx:1.28" });
    assert.equal(servicePatches.length, 0);
  });

  it("ignores a missing Service", async () => {
    const { fake } = clients({ servicePatch: async () => { throw new FakeApiError(404); } });
    await updateApp(fake, "pier-apps", "hello", { port: 3000 });
  });

  it("merges partial resources onto the current values", async () => {
    const { fake, deploymentPatches } = clients();
    await updateApp(fake, "pier-apps", "hello", { resources: { limits: { memory: "1Gi" } } });
    const ops = deploymentPatches[0]?.body as Array<{ value: { limits: Record<string, string> } }>;
    assert.equal(ops[0]?.value.limits.memory, "1Gi");
    assert.equal(ops[0]?.value.limits.cpu, "500m");
  });

  it("rejects resources with a limit below the request", async () => {
    const { fake, deploymentPatches } = clients();
    await assert.rejects(
      updateApp(fake, "pier-apps", "hello", { resources: { requests: { memory: "512Mi" } } }),
      InvalidResourcesError,
    );
    assert.equal(deploymentPatches.length, 0);
  });

  it("throws AppNotFoundError for a missing app", async () => {
    const { fake } = clients({ live: false });
    await assert.rejects(updateApp(fake, "pier-apps", "hello", { replicas: 2 }), AppNotFoundError);
  });

  it("rejects replicas above one for volume apps", async () => {
    const { fake } = clients();
    await assert.rejects(updateApp(fake, "pier-apps", "hello", {
      replicas: 3, volumes: [{ name: "data", mountPath: "/data", size: "1Gi" }],
    }), VolumesReplicaError);
  });

  it("does not raise paused replicas when volume strategy changes", () => {
    const ops = buildUpdateOps({ volumes: [{ name: "data", mountPath: "/data" }] }, undefined, 0);
    assert.equal(ops.find((op) => op.path === "/spec/replicas"), undefined);
  });
});
