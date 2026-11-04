import type { CoreV1Event, V1Deployment, V1Pod, V1ReplicaSet } from "@kubernetes/client-node";
import { apiStatusCode } from "../k8s/api-errors.js";
import type { K8sClients } from "../k8s/clients.js";
import { appSelector } from "../k8s/labels.js";

/** Everything the evaluator needs from the cluster for one app, read with get/list only. */
export type DeploySnapshot = {
  deployment: V1Deployment | null;
  replicaSets: V1ReplicaSet[];
  pods: V1Pod[];
  events: CoreV1Event[];
};

/** Read one app's Deployment, ReplicaSets, pods and the namespace events. A 404 Deployment is null. */
export async function observeApp(clients: K8sClients, namespace: string, app: string): Promise<DeploySnapshot> {
  const labelSelector = appSelector(app);
  const deployment = clients.apps.readNamespacedDeployment({ name: app, namespace }).catch((err: unknown) => {
    if (apiStatusCode(err) === 404) return null;
    throw err;
  });
  const [dep, replicaSets, pods, events] = await Promise.all([
    deployment,
    clients.apps.listNamespacedReplicaSet({ namespace, labelSelector }),
    clients.core.listNamespacedPod({ namespace, labelSelector }),
    clients.core.listNamespacedEvent({ namespace }),
  ]);
  return { deployment: dep, replicaSets: replicaSets.items ?? [], pods: pods.items ?? [], events: events.items ?? [] };
}
