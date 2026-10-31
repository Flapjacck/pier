import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppsV1Api, NetworkingV1Api, V1Deployment, V1Ingress } from "@kubernetes/client-node";
import { getLiveApp, getAppHost, getApp } from "../../src/k8s/app-lookup.js";
import { APP_LABEL } from "../../src/k8s/labels.js";
import { FakeApiError } from "../helpers/fake-clients.js";

const testDeploy: V1Deployment = {
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "hello",
    labels: { [APP_LABEL]: "hello" },
    creationTimestamp: new Date("2026-10-29T15:00:00.000Z"),
  },
  spec: {
    replicas: 1,
    selector: { matchLabels: { [APP_LABEL]: "hello" } },
    template: {
      spec: {
        containers: [
          { name: "app", image: "nginx:1.27", ports: [{ name: "http", containerPort: 8080 }] },
        ],
      },
    },
  },
  status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
};

const testIngress: V1Ingress = {
  apiVersion: "networking.k8s.io/v1",
  kind: "Ingress",
  metadata: {
    name: "hello",
    labels: { [APP_LABEL]: "hello" },
  },
  spec: {
    rules: [{ host: "hello.192.0.2.10.nip.io" }],
  },
};

describe("getLiveApp", () => {
  it("returns the Deployment when found", async () => {
    const api = {
      readNamespacedDeployment: async () => testDeploy,
    } as unknown as AppsV1Api;

    const result = await getLiveApp(api, "pier-apps", "hello");
    assert.deepEqual(result, testDeploy);
  });

  it("returns undefined on 404", async () => {
    const api = {
      readNamespacedDeployment: async () => {
        throw new FakeApiError(404);
      },
    } as unknown as AppsV1Api;

    const result = await getLiveApp(api, "pier-apps", "hello");
    assert.equal(result, undefined);
  });

  it("returns undefined when deletionTimestamp is set", async () => {
    const terminatingDeploy = {
      ...testDeploy,
      metadata: { ...testDeploy.metadata, deletionTimestamp: new Date() },
    };
    const api = {
      readNamespacedDeployment: async () => terminatingDeploy,
    } as unknown as AppsV1Api;

    const result = await getLiveApp(api, "pier-apps", "hello");
    assert.equal(result, undefined);
  });

  it("returns undefined when pier.app label doesn't match the requested name", async () => {
    const wrongLabelDeploy = {
      ...testDeploy,
      metadata: { ...testDeploy.metadata, labels: { [APP_LABEL]: "other-app" } },
    };
    const api = {
      readNamespacedDeployment: async () => wrongLabelDeploy,
    } as unknown as AppsV1Api;

    const result = await getLiveApp(api, "pier-apps", "hello");
    assert.equal(result, undefined);
  });

  it("returns undefined when pier.app label is missing", async () => {
    const noLabelDeploy = {
      ...testDeploy,
      metadata: { ...testDeploy.metadata, labels: {} },
    };
    const api = {
      readNamespacedDeployment: async () => noLabelDeploy,
    } as unknown as AppsV1Api;

    const result = await getLiveApp(api, "pier-apps", "hello");
    assert.equal(result, undefined);
  });

  it("rethrows API errors other than 404", async () => {
    const api = {
      readNamespacedDeployment: async () => {
        throw new FakeApiError(500, "Internal Server Error");
      },
    } as unknown as AppsV1Api;

    try {
      await getLiveApp(api, "pier-apps", "hello");
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("Internal Server Error"));
    }
  });
});

describe("getAppHost", () => {
  it("returns the host from the Ingress", async () => {
    const api = {
      readNamespacedIngress: async () => testIngress,
    } as unknown as NetworkingV1Api;

    const result = await getAppHost(api, "pier-apps", "hello");
    assert.equal(result, "hello.192.0.2.10.nip.io");
  });

  it("returns undefined on 404", async () => {
    const api = {
      readNamespacedIngress: async () => {
        throw new FakeApiError(404);
      },
    } as unknown as NetworkingV1Api;

    const result = await getAppHost(api, "pier-apps", "hello");
    assert.equal(result, undefined);
  });

  it("returns undefined when deletionTimestamp is set", async () => {
    const terminatingIngress = {
      ...testIngress,
      metadata: { ...testIngress.metadata, deletionTimestamp: new Date() },
    };
    const api = {
      readNamespacedIngress: async () => terminatingIngress,
    } as unknown as NetworkingV1Api;

    const result = await getAppHost(api, "pier-apps", "hello");
    assert.equal(result, undefined);
  });

  it("returns undefined when pier.app label doesn't match", async () => {
    const wrongLabelIngress = {
      ...testIngress,
      metadata: { ...testIngress.metadata, labels: { [APP_LABEL]: "other-app" } },
    };
    const api = {
      readNamespacedIngress: async () => wrongLabelIngress,
    } as unknown as NetworkingV1Api;

    const result = await getAppHost(api, "pier-apps", "hello");
    assert.equal(result, undefined);
  });

  it("rethrows API errors other than 404", async () => {
    const api = {
      readNamespacedIngress: async () => {
        throw new FakeApiError(500, "Internal Server Error");
      },
    } as unknown as NetworkingV1Api;

    try {
      await getAppHost(api, "pier-apps", "hello");
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("Internal Server Error"));
    }
  });
});

describe("getApp", () => {
  it("returns an App with host and url when both Deployment and Ingress are found", async () => {
    const clients = {
      apps: {
        readNamespacedDeployment: async () => testDeploy,
      } as unknown as AppsV1Api,
      networking: {
        readNamespacedIngress: async () => testIngress,
      } as unknown as NetworkingV1Api,
    };

    const result = await getApp(clients, "pier-apps", "hello");
    assert(result);
    assert.equal(result.name, "hello");
    assert.equal(result.port, 8080);
    assert.equal(result.host, "hello.192.0.2.10.nip.io");
    assert.equal(result.url, "http://hello.192.0.2.10.nip.io");
  });

  it("returns undefined when the Deployment is not found", async () => {
    const clients = {
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
      } as unknown as AppsV1Api,
      networking: {
        readNamespacedIngress: async () => testIngress,
      } as unknown as NetworkingV1Api,
    };

    const result = await getApp(clients, "pier-apps", "hello");
    assert.equal(result, undefined);
  });

  it("returns an App with port but no host/url when Ingress is not found", async () => {
    const clients = {
      apps: {
        readNamespacedDeployment: async () => testDeploy,
      } as unknown as AppsV1Api,
      networking: {
        readNamespacedIngress: async () => {
          throw new FakeApiError(404);
        },
      } as unknown as NetworkingV1Api,
    };

    const result = await getApp(clients, "pier-apps", "hello");
    assert(result);
    assert.equal(result.name, "hello");
    assert.equal(result.port, 8080);
    assert.equal("host" in result, false);
    assert.equal("url" in result, false);
  });
});
