import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { V1Deployment } from "@kubernetes/client-node";
import { createApp, AppExistsError, HostInUseError } from "../../src/k8s/create-app.js";
import type { CreateAppInput } from "../../src/k8s/manifests.js";
import { FakeApiError } from "../helpers/fake-clients.js";

const baseInput: CreateAppInput = {
  name: "hello",
  image: "nginx:1.27",
  port: 80,
  replicas: 1,
};

describe("createApp", () => {
  it("creates deployment, service, and returns app on success", async () => {
    let deploymentCreated = false;
    let serviceCreated = false;
    const fakeDeployment: V1Deployment = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: "hello",
        uid: "dep-uid-123",
        labels: { "pier.app": "hello" },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { "pier.app": "hello" } },
        template: {
          spec: {
            containers: [{ name: "app", image: "nginx:1.27" }],
          },
        },
      },
      status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
    };

    const clients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => {
          deploymentCreated = true;
          return fakeDeployment;
        },
        deleteNamespacedDeployment: async () => {
          /* noop */
        },
      },
      core: {
        createNamespacedService: async () => {
          serviceCreated = true;
          return {};
        },
        deleteNamespacedService: async () => {
          /* noop */
        },
      },
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        createNamespacedIngress: async () => {
          /* noop */
        },
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    } as never;

    const app = await createApp(clients, "pier-apps", baseInput);
    assert.equal(app.name, "hello");
    assert.equal(deploymentCreated, true);
    assert.equal(serviceCreated, true);
  });

  it("creates deployment, service, and ingress when host provided", async () => {
    let ingressCreated = false;
    const fakeDeployment: V1Deployment = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: "hello",
        uid: "dep-uid-123",
        labels: { "pier.app": "hello" },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { "pier.app": "hello" } },
        template: {
          spec: {
            containers: [{ name: "app", image: "nginx:1.27" }],
          },
        },
      },
      status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
    };

    const clients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => fakeDeployment,
        deleteNamespacedDeployment: async () => {
          /* noop */
        },
      },
      core: {
        createNamespacedService: async () => ({}),
        deleteNamespacedService: async () => {
          /* noop */
        },
      },
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        createNamespacedIngress: async () => {
          ingressCreated = true;
          return {};
        },
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    } as never;

    await createApp(clients, "pier-apps", {
      ...baseInput,
      host: "hello.example.com",
    });
    assert.equal(ingressCreated, true);
  });

  it("throws AppExistsError when deployment already exists", async () => {
    const clients = {
      apps: {
        readNamespacedDeployment: async () => ({
          metadata: { name: "hello" },
        }),
      },
    } as never;

    await assert.rejects(
      () => createApp(clients, "pier-apps", baseInput),
      AppExistsError,
    );
  });

  it("throws AppExistsError on 409 from deployment create", async () => {
    const clients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => {
          throw new FakeApiError(409);
        },
        deleteNamespacedDeployment: async () => {
          /* noop */
        },
      },
      core: {
        deleteNamespacedService: async () => {
          /* noop */
        },
      },
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    } as never;

    await assert.rejects(
      () => createApp(clients, "pier-apps", baseInput),
      AppExistsError,
    );
  });

  it("throws HostInUseError when host is already in use", async () => {
    const clients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
      },
      networking: {
        listNamespacedIngress: async () => ({
          items: [
            {
              spec: {
                rules: [{ host: "hello.example.com" }],
              },
            },
          ],
        }),
      },
    } as never;

    await assert.rejects(
      () =>
        createApp(clients, "pier-apps", {
          ...baseInput,
          host: "hello.example.com",
        }),
      HostInUseError,
    );
  });

  it("rolls back deployment when service create fails", async () => {
    let deploymentCreated = false;
    let deploymentDeleted = false;
    const fakeDeployment: V1Deployment = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: "hello",
        uid: "dep-uid-123",
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { "pier.app": "hello" } },
        template: { spec: { containers: [] } },
      },
    };

    const clients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => {
          deploymentCreated = true;
          return fakeDeployment;
        },
        deleteNamespacedDeployment: async () => {
          deploymentDeleted = true;
        },
      },
      core: {
        createNamespacedService: async () => {
          throw new Error("Service create failed");
        },
        deleteNamespacedService: async () => {
          /* noop */
        },
      },
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    } as never;

    await assert.rejects(() => createApp(clients, "pier-apps", baseInput));
    assert.equal(deploymentCreated, true);
    assert.equal(deploymentDeleted, true);
  });

  it("rolls back service and deployment when ingress create fails", async () => {
    let deploymentDeleted = false;
    let serviceDeleted = false;
    const fakeDeployment: V1Deployment = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: "hello",
        uid: "dep-uid-123",
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { "pier.app": "hello" } },
        template: { spec: { containers: [] } },
      },
    };

    const clients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => fakeDeployment,
        deleteNamespacedDeployment: async () => {
          deploymentDeleted = true;
        },
      },
      core: {
        createNamespacedService: async () => ({}),
        deleteNamespacedService: async () => {
          serviceDeleted = true;
        },
      },
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        createNamespacedIngress: async () => {
          throw new Error("Ingress create failed");
        },
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    } as never;

    await assert.rejects(() =>
      createApp(clients, "pier-apps", {
        ...baseInput,
        host: "hello.example.com",
      }),
    );
    assert.equal(serviceDeleted, true);
    assert.equal(deploymentDeleted, true);
  });

  it("skips ingress if host not provided", async () => {
    let ingressChecked = false;
    const fakeDeployment: V1Deployment = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name: "hello",
        uid: "dep-uid-123",
        labels: { "pier.app": "hello" },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { "pier.app": "hello" } },
        template: {
          spec: {
            containers: [{ name: "app", image: "nginx:1.27" }],
          },
        },
      },
      status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
    };

    const clients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => fakeDeployment,
        deleteNamespacedDeployment: async () => {
          /* noop */
        },
      },
      core: {
        createNamespacedService: async () => ({}),
        deleteNamespacedService: async () => {
          /* noop */
        },
      },
      networking: {
        listNamespacedIngress: async () => {
          ingressChecked = true;
          return { items: [] };
        },
        createNamespacedIngress: async () => {
          throw new Error("Should not be called");
        },
        deleteNamespacedIngress: async () => {
          /* noop */
        },
      },
    } as never;

    await createApp(clients, "pier-apps", baseInput);
    // ingress list should not be called when no host.
    assert.equal(ingressChecked, false);
  });
});
