import type { V1Deployment, V1PersistentVolume, V1PersistentVolumeClaim, V1ResourceQuota } from "@kubernetes/client-node";
import { buildPvc } from "../../src/k8s/volumes/pvc.js";
import { FakeApiError } from "./fake-clients.js";

type JsonOp = { op: string; path: string; value: unknown };
type Named = { name: string };

export type FakeVolumeClusterOptions = {
  /** PVC names whose create call fails with a quota 403. */
  quotaFailPvcs?: string[];
  /** Make the next Deployment patch fail with a 500. */
  failDeploymentPatch?: boolean;
  /** Make Deployment create fail with a 500. */
  failDeploymentCreate?: boolean;
  /** PVC names whose label patch fails. */
  failLabelPatch?: string[];
  /** ResourceQuota objects returned to the resource-fit pre-check. */
  quotas?: V1ResourceQuota[];
  /** No pier-local StorageClass. */
  noStorageClass?: boolean;
  /** PV patch fails (reclaim flip). */
  failPvPatch?: boolean;
};

/** A deployment shaped like Pier creates, optionally with volume mounts. */
export function volumeDeployment(
  name: string,
  mounts: Array<{ claim: string; mountPath: string }> = [],
  replicas = 1,
): V1Deployment {
  return {
    metadata: { name, labels: { "pier.app": name, "app.kubernetes.io/managed-by": "pier" } },
    spec: {
      replicas,
      selector: { matchLabels: { "pier.app": name } },
      strategy: { type: mounts.length ? "Recreate" : "RollingUpdate" },
      template: {
        spec: {
          volumes: mounts.map((m) => ({ name: `vol-${m.claim}`, persistentVolumeClaim: { claimName: m.claim } })),
          containers: [{
            name: "app",
            image: "nginx:1.27",
            ports: [{ name: "http", containerPort: 80 }],
            volumeMounts: mounts.map((m) => ({ name: `vol-${m.claim}`, mountPath: m.mountPath })),
          }],
        },
      },
    },
  };
}

/** A bound, managed PVC, optionally labelled as attached to an app. */
export function boundPvc(name: string, app?: string): V1PersistentVolumeClaim {
  const pvc = buildPvc(name, "1Gi");
  if (app && pvc.metadata?.labels) pvc.metadata.labels["pier.app"] = app;
  return { ...pvc, spec: { ...pvc.spec, volumeName: `pv-${name}` }, status: { phase: "Bound" } };
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let node: Record<string, unknown> | unknown[] = target;
  for (const part of parts.slice(0, -1)) {
    const key: string | number = Array.isArray(node) ? Number(part) : part;
    const holder = node as Record<string | number, unknown>;
    if (holder[key] === undefined) holder[key] = {};
    node = holder[key] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1] ?? "";
  (node as Record<string | number, unknown>)[Array.isArray(node) ? Number(last) : last] = value;
}

/** In-memory Deployments + PVCs + PVs, enough for volume flows end to end. */
export function fakeVolumeCluster(opts: FakeVolumeClusterOptions = {}) {
  const deployments = new Map<string, V1Deployment>();
  const pvcs = new Map<string, V1PersistentVolumeClaim>();
  const pvs = new Map<string, V1PersistentVolume>();
  const calls: string[] = [];
  let failPatch = opts.failDeploymentPatch ?? false;

  const notFound = () => new FakeApiError(404);
  const apps = {
    readNamespacedDeployment: async ({ name }: Named) => {
      const d = deployments.get(name);
      if (!d) throw notFound();
      return structuredClone(d);
    },
    listNamespacedDeployment: async () => ({ items: [...deployments.values()].map((d) => structuredClone(d)) }),
    createNamespacedDeployment: async ({ body }: { body: V1Deployment }) => {
      calls.push(`create deployment ${body.metadata?.name}`);
      if (opts.failDeploymentCreate) throw new FakeApiError(500);
      const d = { ...structuredClone(body), metadata: { ...body.metadata, uid: "uid-1" } };
      deployments.set(body.metadata?.name ?? "", d);
      return structuredClone(d);
    },
    patchNamespacedDeployment: async ({ name, body }: Named & { body: JsonOp[] }) => {
      calls.push(`patch deployment ${name}`);
      if (failPatch) { failPatch = false; throw new FakeApiError(500); }
      const d = deployments.get(name);
      if (!d) throw notFound();
      for (const op of body) setPath(d as unknown as Record<string, unknown>, op.path, structuredClone(op.value));
      return structuredClone(d);
    },
    deleteNamespacedDeployment: async ({ name }: Named) => {
      calls.push(`delete deployment ${name}`);
      const d = deployments.get(name);
      if (!d) throw notFound();
      // Foreground deletion: the object stays listed with a deletionTimestamp.
      d.metadata = { ...d.metadata, deletionTimestamp: new Date() };
      return {};
    },
    replaceNamespacedDeploymentScale: async ({ name, body }: Named & { body: { spec?: { replicas?: number } } }) => {
      const d = deployments.get(name);
      if (!d?.spec) throw notFound();
      d.spec.replicas = body.spec?.replicas;
      return {};
    },
  };

  const pvcLabelsMatch = (pvc: V1PersistentVolumeClaim) => pvc.metadata?.labels?.["app.kubernetes.io/managed-by"] === "pier";
  const core = {
    listNamespacedPersistentVolumeClaim: async () => ({ items: [...pvcs.values()].filter(pvcLabelsMatch).map((p) => structuredClone(p)) }),
    readNamespacedPersistentVolumeClaim: async ({ name }: Named) => {
      const p = pvcs.get(name);
      if (!p) throw notFound();
      return structuredClone(p);
    },
    createNamespacedPersistentVolumeClaim: async ({ body }: { body: V1PersistentVolumeClaim }) => {
      const name = body.metadata?.name ?? "";
      calls.push(`create pvc ${name}`);
      if (opts.quotaFailPvcs?.includes(name)) throw new FakeApiError(403, "persistentvolumeclaims is forbidden: exceeded quota");
      if (pvcs.has(name)) throw new FakeApiError(409);
      const p = { ...structuredClone(body), spec: { ...body.spec, volumeName: `pv-${name}` }, status: { phase: "Bound" } };
      pvcs.set(name, p);
      pvs.set(`pv-${name}`, { metadata: { name: `pv-${name}` }, spec: { persistentVolumeReclaimPolicy: "Retain" } });
      return structuredClone(p);
    },
    patchNamespacedPersistentVolumeClaim: async ({ name, body }: Named & { body: { metadata?: { labels?: Record<string, string | null> } } }) => {
      calls.push(`label pvc ${name} ${body.metadata?.labels?.["pier.app"] ?? "-"}`);
      if (opts.failLabelPatch?.includes(name)) throw new FakeApiError(500);
      const p = pvcs.get(name);
      if (!p) throw notFound();
      // JSON merge patch: keys left out are kept, null removes a key.
      const labels: Record<string, string> = { ...p.metadata?.labels };
      for (const [key, value] of Object.entries(body.metadata?.labels ?? {})) {
        if (value === null) delete labels[key];
        else labels[key] = value;
      }
      p.metadata = { ...p.metadata, labels };
      return structuredClone(p);
    },
    deleteNamespacedPersistentVolumeClaim: async ({ name }: Named) => {
      calls.push(`delete pvc ${name}`);
      const p = pvcs.get(name);
      if (!p) throw notFound();
      pvcs.delete(name);
      const pvName = p.spec?.volumeName;
      const pv = pvName ? pvs.get(pvName) : undefined;
      if (pvName && pv?.spec?.persistentVolumeReclaimPolicy === "Delete") pvs.delete(pvName);
      return {};
    },
    readPersistentVolume: async ({ name }: Named) => {
      const pv = pvs.get(name);
      if (!pv) throw notFound();
      return structuredClone(pv);
    },
    patchPersistentVolume: async ({ name, body }: Named & { body: { spec?: { persistentVolumeReclaimPolicy?: string } } }) => {
      calls.push(`patch pv ${name}`);
      if (opts.failPvPatch) throw new FakeApiError(403);
      const pv = pvs.get(name);
      if (!pv) throw notFound();
      pv.spec = { ...pv.spec, persistentVolumeReclaimPolicy: body.spec?.persistentVolumeReclaimPolicy };
      return structuredClone(pv);
    },
    createNamespacedService: async () => ({}),
    deleteNamespacedService: async () => ({}),
    patchNamespacedService: async () => ({}),
    readNamespacedService: async () => { throw notFound(); },
    listNamespacedLimitRange: async () => ({ items: [] }),
    listNamespacedResourceQuota: async () => ({ items: opts.quotas ?? [] }),
  };

  const networking = {
    listNamespacedIngress: async () => ({ items: [] }),
    readNamespacedIngress: async () => { throw notFound(); },
    createNamespacedIngress: async () => ({}),
    deleteNamespacedIngress: async () => { throw notFound(); },
  };

  const storage = {
    readStorageClass: async () => {
      if (opts.noStorageClass) throw notFound();
      return { metadata: { name: "pier-local" } };
    },
  };

  return { apps, core, networking, storage, deployments, pvcs, pvs, calls };
}

/** Typed client bundle for src functions (the fakes implement only what the flows call). */
export function asClients(cluster: ReturnType<typeof fakeVolumeCluster>) {
  return { apps: cluster.apps, core: cluster.core, networking: cluster.networking, storage: cluster.storage } as never;
}
