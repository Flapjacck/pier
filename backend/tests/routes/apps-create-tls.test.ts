import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { V1Deployment, V1Ingress } from "@kubernetes/client-node";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult, FakeApiError } from "../helpers/fake-clients.js";
import { authHeader, testConfig } from "../helpers/test-config.js";

// POST /api/apps with and without PIER_TLS_ISSUER (#29): the Ingress the
// backend creates, and the url it returns.

const fakeDeployment: V1Deployment = {
  metadata: { name: "hello", uid: "dep-uid-123", labels: { "pier.app": "hello" } },
  spec: {
    replicas: 1,
    selector: { matchLabels: { "pier.app": "hello" } },
    template: { spec: { containers: [{ name: "app", image: "nginx:1.27", ports: [{ name: "http", containerPort: 80 }] }] } },
  },
  status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
};

async function create(tlsIssuer: string | undefined): Promise<{ status: number; url: string; ingress?: V1Ingress }> {
  let ingress: V1Ingress | undefined;
  const noop = async () => ({});
  const app = await buildApp(testConfig({ ingressDomain: "192.0.2.10.nip.io", tlsIssuer }), {
    logger: false,
    k8s: createFakeClientsResult({
      apps: {
        readNamespacedDeployment: async () => {
          throw new FakeApiError(404);
        },
        createNamespacedDeployment: async () => fakeDeployment,
        deleteNamespacedDeployment: noop,
      } as never,
      core: { createNamespacedService: noop, deleteNamespacedService: noop } as never,
      networking: {
        listNamespacedIngress: async () => ({ items: [] }),
        createNamespacedIngress: async ({ body }: { body: V1Ingress }) => {
          ingress = body;
          return body;
        },
        deleteNamespacedIngress: noop,
      } as never,
    }),
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/apps",
    headers: authHeader,
    payload: { name: "hello", image: "nginx:1.27", port: 80, host: "hello.192.0.2.10.nip.io" },
  });
  await app.close();
  return { status: res.statusCode, url: (res.json() as { url: string }).url, ingress };
}

describe("POST /api/apps with TLS", () => {
  it("creates a TLS Ingress and returns an https url when PIER_TLS_ISSUER is set", async () => {
    const { status, url, ingress } = await create("pier-ca");
    assert.equal(status, 201);
    assert.equal(url, "https://hello.192.0.2.10.nip.io");
    assert.equal(ingress?.metadata?.annotations?.["cert-manager.io/cluster-issuer"], "pier-ca");
    assert.equal(
      ingress?.metadata?.annotations?.["traefik.ingress.kubernetes.io/router.middlewares"],
      "pier-apps-pier-https-redirect@kubernetescrd",
    );
    assert.deepEqual(ingress?.spec?.tls, [{ hosts: ["hello.192.0.2.10.nip.io"], secretName: "hello-tls" }]);
  });

  it("keeps the HTTP-only Ingress and an http url without an issuer", async () => {
    const { status, url, ingress } = await create(undefined);
    assert.equal(status, 201);
    assert.equal(url, "http://hello.192.0.2.10.nip.io");
    assert.equal(ingress?.metadata?.annotations, undefined);
    assert.equal(ingress?.spec?.tls, undefined);
  });
});
