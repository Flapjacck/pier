import type { V1Deployment, V1Pod, V1ReplicaSet } from "@kubernetes/client-node";
import type { DeploySnapshot } from "./observe.js";

export const REVISION_ANNOTATION = "deployment.kubernetes.io/revision";

/** True once the Deployment controller has seen the spec this deploy applied. */
export function observed(deployment: V1Deployment, generation: number): boolean {
  return (deployment.status?.observedGeneration ?? 0) >= generation;
}

/**
 * The ReplicaSet for the applied pod template: owned by the Deployment and carrying the
 * Deployment's current revision. Only trusted once the controller observed `generation`.
 */
export function newReplicaSet(snapshot: DeploySnapshot, generation: number): V1ReplicaSet | undefined {
  const dep = snapshot.deployment;
  if (!dep || !observed(dep, generation)) return undefined;
  const uid = dep.metadata?.uid;
  const revision = dep.metadata?.annotations?.[REVISION_ANNOTATION];
  if (!uid || !revision) return undefined;
  return snapshot.replicaSets.find(
    (rs) =>
      rs.metadata?.annotations?.[REVISION_ANNOTATION] === revision &&
      (rs.metadata?.ownerReferences ?? []).some((ref) => ref.uid === uid),
  );
}

/** Pods owned by the new ReplicaSet, skipping ones already being deleted. */
export function newPods(snapshot: DeploySnapshot, rs: V1ReplicaSet | undefined): V1Pod[] {
  const uid = rs?.metadata?.uid;
  if (!uid) return [];
  return snapshot.pods.filter(
    (pod) => !pod.metadata?.deletionTimestamp && (pod.metadata?.ownerReferences ?? []).some((ref) => ref.uid === uid),
  );
}
