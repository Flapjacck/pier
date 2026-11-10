import type { V1Deployment } from "@kubernetes/client-node";
import type { BuildResult, RunBuildInput } from "../../src/builds/run.js";
import { gitCredentialSecret } from "../../src/k8s/git-credentials/secrets.js";
import { createFakeClientsResult, FakeApiError } from "./fake-clients.js";

/** A one-app fake cluster for build-from-repo tests (#83). */
export type SourceCluster = {
  live?: V1Deployment;
  credentials: string[];
  createError?: unknown;
  creates: V1Deployment[];
  patches: unknown[];
};

export function sourceCluster(o: Partial<SourceCluster> = {}): SourceCluster {
  return { credentials: [], creates: [], patches: [], ...o };
}

export function liveDeployment(image = "localhost:30500/web:d1"): V1Deployment {
  return {
    metadata: { name: "web", uid: "dep-1", labels: { "pier.app": "web" }, generation: 1, creationTimestamp: new Date("2026-11-10T15:00:00Z") },
    spec: {
      replicas: 1,
      selector: { matchLabels: { "pier.app": "web" } },
      template: { spec: { containers: [{ name: "app", image, ports: [{ name: "http", containerPort: 3000 }], env: [{ name: "SECRET", value: "hunter2" }] }] } },
    },
    status: { readyReplicas: 1, updatedReplicas: 1, observedGeneration: 1 },
  };
}

export function sourceK8s(c: SourceCluster) {
  const notFound = async () => {
    throw new FakeApiError(404);
  };
  const setImage = (image: string) => {
    c.live = liveDeployment(image);
    return c.live;
  };
  return createFakeClientsResult({
    apps: {
      readNamespacedDeployment: async () => c.live ?? notFound(),
      listNamespacedDeployment: async () => ({ items: c.live ? [c.live] : [] }),
      createNamespacedDeployment: async ({ body }: { body: V1Deployment }) => {
        if (c.createError) throw c.createError;
        c.creates.push(body);
        return setImage(body.spec?.template.spec?.containers[0]?.image ?? "");
      },
      patchNamespacedDeployment: async ({ body }: { body: unknown }) => {
        c.patches.push(body);
        const image = JSON.stringify(body).match(/localhost:30500\/web:d\d+/)?.[0];
        return image ? setImage(image) : (c.live ?? notFound());
      },
      deleteNamespacedDeployment: async () => {
        if (!c.live) return notFound();
        c.live = undefined;
        return {};
      },
      listNamespacedReplicaSet: async () => ({ items: [] }),
    } as never,
    core: {
      readNamespacedSecret: async ({ name }: { name: string }) => {
        const cred = c.credentials.find((n) => `pier-git-${n}` === name);
        return cred ? { ...gitCredentialSecret({ name: cred, username: "x-access-token", token: "ghp_secret" }) } : notFound();
      },
      createNamespacedService: async () => ({}),
      readNamespacedService: notFound,
      deleteNamespacedService: notFound,
      patchNamespacedService: async () => ({}),
      listNamespacedPod: async () => ({ items: [] }),
      listNamespacedEvent: async () => ({ items: [] }),
      listNamespacedLimitRange: async () => ({ items: [] }),
      listNamespacedResourceQuota: async () => ({ items: [] }),
      listNamespacedPersistentVolumeClaim: async () => ({ items: [] }),
    } as never,
    networking: {
      listNamespacedIngress: async () => ({ items: [] }),
      readNamespacedIngress: notFound,
      deleteNamespacedIngress: notFound,
    } as never,
    batch: {} as never,
  });
}

/** A runBuild stand-in: resolves when the test calls finish(). */
export function fakeBuilds() {
  const pending: { input: RunBuildInput; resolve: (r: BuildResult) => void }[] = [];
  const runBuild = (_clients: unknown, input: RunBuildInput) => new Promise<BuildResult>((resolve) => pending.push({ input, resolve }));
  const finish = (result?: BuildResult) => {
    const next = pending.shift();
    if (!next) throw new Error("no build running");
    next.resolve(result ?? { ok: true, image: `localhost:30500/web:d${next.input.handle.id}`, commit: "0123456789abcdef" });
  };
  return { runBuild, finish, pending };
}
