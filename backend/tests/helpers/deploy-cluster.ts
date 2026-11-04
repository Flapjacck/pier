import type * as k8s from "@kubernetes/client-node";
import type { DeploySnapshot } from "../../src/deploys/observe.js";
import type { K8sClientsResult } from "../../src/k8s/clients.js";
import { createFakeClientsResult, FakeApiError } from "./fake-clients.js";

/** Builders for fake cluster snapshots used by the deploy evaluator and tracker tests. */
export const REV = "deployment.kubernetes.io/revision";

export type DepOptions = {
  generation?: number;
  observedGeneration?: number;
  revision?: string;
  replicas?: number;
  updated?: number;
  available?: number;
  current?: number;
  progressDeadline?: boolean;
};

export function dep(o: DepOptions = {}): k8s.V1Deployment {
  const conditions: k8s.V1DeploymentCondition[] = o.progressDeadline
    ? [{ type: "Progressing", status: "False", reason: "ProgressDeadlineExceeded", message: "too slow" }]
    : [];
  return {
    metadata: { name: "web", uid: "dep-uid", generation: o.generation ?? 2, annotations: { [REV]: o.revision ?? "2" } },
    spec: { replicas: o.replicas ?? 1, selector: {}, template: {} },
    status: {
      observedGeneration: o.observedGeneration ?? o.generation ?? 2,
      updatedReplicas: o.updated ?? 0,
      availableReplicas: o.available ?? 0,
      replicas: o.current ?? 0,
      conditions,
    },
  };
}

export function rs(uid = "rs-2", revision = "2", failure?: string): k8s.V1ReplicaSet {
  return {
    metadata: { name: `web-${uid}`, uid, annotations: { [REV]: revision }, ownerReferences: [{ uid: "dep-uid", apiVersion: "apps/v1", kind: "Deployment", name: "web" }] },
    status: { replicas: 1, conditions: failure ? [{ type: "ReplicaFailure", status: "True", reason: "FailedCreate", message: failure }] : [] },
  };
}

export type PodOptions = {
  uid?: string;
  owner?: string;
  scheduled?: boolean;
  unschedulableSince?: number;
  container?: Partial<k8s.V1ContainerStatus>;
  ready?: boolean;
  deleting?: boolean;
  memoryLimit?: string;
};

export function pod(o: PodOptions = {}): k8s.V1Pod {
  const conditions: k8s.V1PodCondition[] = [];
  if (o.scheduled) conditions.push({ type: "PodScheduled", status: "True" });
  if (o.unschedulableSince !== undefined) {
    conditions.push({ type: "PodScheduled", status: "False", reason: "Unschedulable", message: "0/1 nodes are available: 1 Insufficient memory.", lastTransitionTime: new Date(o.unschedulableSince) });
  }
  if (o.ready) conditions.push({ type: "Ready", status: "True" });
  return {
    metadata: {
      name: `web-${o.uid ?? "p1"}`,
      uid: o.uid ?? "p1",
      ownerReferences: [{ uid: o.owner ?? "rs-2", apiVersion: "apps/v1", kind: "ReplicaSet", name: "rs" }],
      ...(o.deleting ? { deletionTimestamp: new Date(0) } : {}),
    },
    spec: { nodeName: o.scheduled ? "node-a" : undefined, containers: [{ name: "app", resources: { limits: { memory: o.memoryLimit ?? "256Mi" } } }] },
    status: {
      conditions,
      containerStatuses: o.container ? [{ name: "app", image: "nginx:bad", imageID: "", ready: Boolean(o.ready), restartCount: 0, ...o.container }] : [],
    },
  };
}

export function event(o: { uid: string; involved: string; reason: string; message: string; type?: string; at: number; count?: number }): k8s.CoreV1Event {
  return {
    metadata: { uid: o.uid },
    involvedObject: { uid: o.involved },
    reason: o.reason,
    message: o.message,
    type: o.type ?? "Normal",
    count: o.count ?? 1,
    lastTimestamp: new Date(o.at),
  };
}

export function snap(parts: Partial<DeploySnapshot> = {}): DeploySnapshot {
  return { deployment: dep(), replicaSets: [rs()], pods: [], events: [], ...parts };
}

/** The steady "everything ready" snapshot for one replica. */
export function readySnap(): DeploySnapshot {
  return snap({
    deployment: dep({ updated: 1, available: 1, current: 1 }),
    pods: [pod({ scheduled: true, ready: true, container: { imageID: "sha", started: true, state: { running: {} } } })],
  });
}

/** Fake clients whose reads come from `state.snapshot`; `state.fail` makes every read throw. */
export function snapshotClients(state: { snapshot: DeploySnapshot; fail?: boolean; reads?: number }): K8sClientsResult {
  const read = <T>(value: () => T): Promise<T> => {
    state.reads = (state.reads ?? 0) + 1;
    return state.fail ? Promise.reject(new Error("cluster down")) : Promise.resolve(value());
  };
  return createFakeClientsResult({
    apps: {
      readNamespacedDeployment: () =>
        state.snapshot.deployment ? read(() => state.snapshot.deployment) : state.fail ? read(() => null) : Promise.reject(new FakeApiError(404)),
      listNamespacedReplicaSet: () => read(() => ({ items: state.snapshot.replicaSets })),
    } as unknown as k8s.AppsV1Api,
    core: {
      listNamespacedPod: () => read(() => ({ items: state.snapshot.pods })),
      listNamespacedEvent: () => read(() => ({ items: state.snapshot.events })),
    } as unknown as k8s.CoreV1Api,
  });
}
