import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIngress, type CreateAppInput } from "../../../src/k8s/manifests/index.js";

const baseInput: CreateAppInput = {
  name: "hello",
  image: "nginx:1.27",
  port: 8080,
  replicas: 1,
};

describe("buildIngress", () => {
  it("throws when host is not provided", () => {
    assert.throws(
      () => buildIngress(baseInput),
      (err: Error) => {
        assert.match(err.message, /host/i);
        return true;
      },
    );
  });

  it("creates an Ingress with correct metadata and labels", () => {
    const ing = buildIngress({ ...baseInput, host: "hello.example.com" });
    assert.equal(ing.kind, "Ingress");
    assert.equal(ing.metadata?.name, "hello");
    assert.equal(ing.metadata?.labels?.["pier.app"], "hello");
  });

  it("sets ingressClassName to traefik", () => {
    const ing = buildIngress({ ...baseInput, host: "hello.example.com" });
    assert.equal(ing.spec?.ingressClassName, "traefik");
  });

  it("sets rule with host and path / Prefix", () => {
    const ing = buildIngress({ ...baseInput, host: "hello.example.com" });
    const rule = ing.spec?.rules?.[0];
    assert.equal(rule?.host, "hello.example.com");
    assert.equal(rule?.http?.paths?.[0]?.path, "/");
    assert.equal(rule?.http?.paths?.[0]?.pathType, "Prefix");
  });

  it("sets backend to Service name and port 80", () => {
    const ing = buildIngress({ ...baseInput, host: "hello.example.com" });
    const backend = ing.spec?.rules?.[0]?.http?.paths?.[0]?.backend;
    assert.equal(backend?.service?.name, "hello");
    assert.equal(backend?.service?.port?.number, 80);
  });

  it("adds owner reference to Deployment when uid provided", () => {
    const ing = buildIngress({ ...baseInput, host: "hello.example.com" }, "dep-uid-123");
    const owner = ing.metadata?.ownerReferences?.[0];
    assert.equal(owner?.kind, "Deployment");
    assert.equal(owner?.name, "hello");
    assert.equal(owner?.uid, "dep-uid-123");
    assert.equal(owner?.blockOwnerDeletion, false);
    assert.equal(owner?.controller, false);
  });

  it("omits owner reference when no uid provided", () => {
    const ing = buildIngress({ ...baseInput, host: "hello.example.com" });
    assert(!ing.metadata?.ownerReferences || ing.metadata.ownerReferences.length === 0);
  });
});

describe("buildIngress with TLS", () => {
  const input = { ...baseInput, host: "hello.192.0.2.10.nip.io" };
  const tls = { issuer: "pier-ca", namespace: "pier-apps" };

  it("adds the cert-manager issuer and https redirect annotations", () => {
    const ing = buildIngress(input, "dep-uid-123", tls);
    assert.deepEqual(ing.metadata?.annotations, {
      "cert-manager.io/cluster-issuer": "pier-ca",
      "traefik.ingress.kubernetes.io/router.middlewares": "pier-apps-pier-https-redirect@kubernetescrd",
    });
  });

  it("adds a tls entry for the host with secret <name>-tls", () => {
    const ing = buildIngress(input, undefined, tls);
    assert.deepEqual(ing.spec?.tls, [{ hosts: ["hello.192.0.2.10.nip.io"], secretName: "hello-tls" }]);
  });

  it("prefixes the middleware with the Ingress namespace", () => {
    const ing = buildIngress(input, undefined, { ...tls, namespace: "staging" });
    assert.equal(
      ing.metadata?.annotations?.["traefik.ingress.kubernetes.io/router.middlewares"],
      "staging-pier-https-redirect@kubernetescrd",
    );
  });

  it("keeps everything else identical to the HTTP-only Ingress", () => {
    const plain = buildIngress(input, "dep-uid-123");
    const secure = buildIngress(input, "dep-uid-123", tls);
    assert.equal(plain.metadata?.annotations, undefined);
    assert.equal(plain.spec?.tls, undefined);
    const { annotations: _a, ...secureMeta } = secure.metadata ?? {};
    const { tls: _t, ...secureSpec } = secure.spec ?? {};
    assert.deepEqual(secureMeta, plain.metadata);
    assert.deepEqual(secureSpec, plain.spec);
  });
});
