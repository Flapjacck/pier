import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDeployment,
  buildService,
  buildIngress,
  type CreateAppInput,
  CPU_REQUEST,
  CPU_LIMIT,
  MEMORY_REQUEST,
  MEMORY_LIMIT,
  EPHEMERAL_STORAGE_REQUEST,
  EPHEMERAL_STORAGE_LIMIT,
  PROGRESS_DEADLINE_SECONDS,
} from "../../src/k8s/manifests.js";

const baseInput: CreateAppInput = {
  name: "hello",
  image: "nginx:1.27",
  port: 80,
  replicas: 1,
};

describe("buildDeployment", () => {
  it("creates a Deployment with correct metadata and labels", () => {
    const dep = buildDeployment(baseInput);
    assert.equal(dep.kind, "Deployment");
    assert.equal(dep.metadata?.name, "hello");
    assert.equal(dep.metadata?.labels?.["pier.app"], "hello");
    assert.equal(dep.metadata?.labels?.["app.kubernetes.io/managed-by"], "pier");
  });

  it("sets selector matchLabels to app name", () => {
    const dep = buildDeployment(baseInput);
    assert.equal(dep.spec?.selector?.matchLabels?.["pier.app"], "hello");
  });

  it("sets replicas from input", () => {
    const dep = buildDeployment({ ...baseInput, replicas: 3 });
    assert.equal(dep.spec?.replicas, 3);
  });

  it("sets container image and imagePullPolicy", () => {
    const dep = buildDeployment(baseInput);
    const container = dep.spec?.template?.spec?.containers?.[0];
    assert.equal(container?.image, "nginx:1.27");
    assert.equal(container?.imagePullPolicy, "IfNotPresent");
  });

  it("sets container port with http name", () => {
    const dep = buildDeployment({ ...baseInput, port: 8080 });
    const ports = dep.spec?.template?.spec?.containers?.[0]?.ports;
    assert.equal(ports?.length, 1);
    assert.equal(ports?.[0]?.name, "http");
    assert.equal(ports?.[0]?.containerPort, 8080);
  });

  it("sets CPU, memory and ephemeral-storage requests and limits", () => {
    const dep = buildDeployment(baseInput);
    const resources = dep.spec?.template?.spec?.containers?.[0]?.resources;
    assert.equal(resources?.requests?.cpu, CPU_REQUEST);
    assert.equal(resources?.requests?.memory, MEMORY_REQUEST);
    assert.equal(resources?.requests?.["ephemeral-storage"], EPHEMERAL_STORAGE_REQUEST);
    assert.equal(resources?.limits?.cpu, CPU_LIMIT);
    assert.equal(resources?.limits?.memory, MEMORY_LIMIT);
    assert.equal(resources?.limits?.["ephemeral-storage"], EPHEMERAL_STORAGE_LIMIT);
  });

  it("sets readinessProbe with tcpSocket and timing", () => {
    const dep = buildDeployment(baseInput);
    const probe = dep.spec?.template?.spec?.containers?.[0]?.readinessProbe;
    assert.equal(probe?.tcpSocket?.port, 80);
    assert.equal(probe?.initialDelaySeconds, 2);
    assert.equal(probe?.periodSeconds, 5);
  });

  it("sets pod security context with RuntimeDefault seccomp", () => {
    const dep = buildDeployment(baseInput);
    const podSecCtx = dep.spec?.template?.spec?.securityContext;
    assert.equal(podSecCtx?.seccompProfile?.type, "RuntimeDefault");
  });

  it("sets container security context", () => {
    const dep = buildDeployment(baseInput);
    const containerSecCtx = dep.spec?.template?.spec?.containers?.[0]?.securityContext;
    assert.equal(containerSecCtx?.allowPrivilegeEscalation, false);
    assert.deepEqual(containerSecCtx?.capabilities?.drop, ["ALL"]);
  });

  it("sets automountServiceAccountToken to false", () => {
    const dep = buildDeployment(baseInput);
    assert.equal(dep.spec?.template?.spec?.automountServiceAccountToken, false);
  });

  it("sorts environment variables by key", () => {
    const dep = buildDeployment({
      ...baseInput,
      env: { ZEBRA: "z", APPLE: "a", BANANA: "b" },
    });
    const env = dep.spec?.template?.spec?.containers?.[0]?.env ?? [];
    assert.deepEqual(
      env.map((e) => e.name),
      ["APPLE", "BANANA", "ZEBRA"],
    );
  });

  it("handles empty env", () => {
    const dep = buildDeployment(baseInput);
    const env = dep.spec?.template?.spec?.containers?.[0]?.env ?? [];
    assert.equal(env.length, 0);
  });

  it("pod labels match the Deployment labels", () => {
    const dep = buildDeployment(baseInput);
    const deploymentLabels = dep.metadata?.labels;
    const podLabels = dep.spec?.template?.metadata?.labels;
    assert.deepEqual(podLabels, deploymentLabels);
  });
});

describe("buildService", () => {
  it("creates a Service with correct metadata and labels", () => {
    const svc = buildService(baseInput);
    assert.equal(svc.kind, "Service");
    assert.equal(svc.metadata?.name, "hello");
    assert.equal(svc.metadata?.labels?.["pier.app"], "hello");
  });

  it("sets type to ClusterIP", () => {
    const svc = buildService(baseInput);
    assert.equal(svc.spec?.type, "ClusterIP");
  });

  it("sets selector to app name", () => {
    const svc = buildService(baseInput);
    assert.equal(svc.spec?.selector?.["pier.app"], "hello");
  });

  it("sets port 80 with http name targeting container port", () => {
    const svc = buildService({ ...baseInput, port: 8080 });
    const ports = svc.spec?.ports;
    assert(ports && ports.length > 0);
    assert.equal(ports[0]?.name, "http");
    assert.equal(ports[0]?.port, 80);
    assert.equal(ports[0]?.targetPort, 8080);
  });

  it("adds owner reference to Deployment when uid provided", () => {
    const svc = buildService(baseInput, "dep-uid-123");
    const owner = svc.metadata?.ownerReferences?.[0];
    assert.equal(owner?.kind, "Deployment");
    assert.equal(owner?.name, "hello");
    assert.equal(owner?.uid, "dep-uid-123");
    assert.equal(owner?.blockOwnerDeletion, false);
    assert.equal(owner?.controller, false);
  });

  it("omits owner reference when no uid provided", () => {
    const svc = buildService(baseInput);
    assert(!svc.metadata?.ownerReferences || svc.metadata.ownerReferences.length === 0);
  });
});

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

  it("sets progressDeadlineSeconds to 120 for rapid failure detection", () => {
    const dep = buildDeployment(baseInput);
    assert.equal(dep.spec?.progressDeadlineSeconds, PROGRESS_DEADLINE_SECONDS);
    assert.equal(PROGRESS_DEADLINE_SECONDS, 120);
  });
});
