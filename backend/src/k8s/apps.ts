import type { AppsV1Api, V1Deployment, V1DeploymentCondition } from "@kubernetes/client-node";
import { APP_LABEL, appSelector } from "./labels.js";

export type AppStatus = "running" | "stopped" | "building" | "failed";

export type App = {
  name: string;
  image: string;
  replicas: number;
  ready: number;
  status: AppStatus;
  createdAt: string;
};

function condition(
  d: V1Deployment,
  type: string,
): V1DeploymentCondition | undefined {
  return d.status?.conditions?.find((c) => c.type === type);
}

/**
 * Map Deployment status to a UI-friendly state. Order matters: failed rollout
 * beats "stopped" (scale-to-zero) and in-progress rollouts show as building.
 */
export function deriveStatus(d: V1Deployment): AppStatus {
  const replicas = d.spec?.replicas ?? 1;
  const ready = d.status?.readyReplicas ?? 0;
  const updatedReplicas = d.status?.updatedReplicas ?? 0;
  const generation = d.metadata?.generation ?? 0;
  const observedGeneration = d.status?.observedGeneration ?? 0;

  const progressing = condition(d, "Progressing");
  const available = condition(d, "Available");
  const progressingTrue = progressing?.status === "True";
  const availableFalse = available?.status === "False";

  if (
    progressing?.reason === "ProgressDeadlineExceeded" ||
    (availableFalse && !progressingTrue)
  ) {
    return "failed";
  }

  if (replicas === 0) {
    return "stopped";
  }

  if (
    ready === replicas &&
    updatedReplicas === replicas &&
    observedGeneration >= generation
  ) {
    return "running";
  }

  return "building";
}

function creationTimestampIso(d: V1Deployment): string {
  const raw = d.metadata?.creationTimestamp;
  if (raw === undefined) {
    return new Date(0).toISOString();
  }
  if (raw instanceof Date) {
    return raw.toISOString();
  }
  return new Date(raw).toISOString();
}

/** Pure mapping from a namespaced Deployment to the public App shape. */
export function deploymentToApp(d: V1Deployment): App {
  const replicas = d.spec?.replicas ?? 1;
  const ready = d.status?.readyReplicas ?? 0;
  const name =
    d.metadata?.labels?.[APP_LABEL] ?? d.metadata?.name ?? "";
  const image =
    d.spec?.template?.spec?.containers?.[0]?.image ?? "";

  return {
    name,
    image,
    replicas,
    ready,
    status: deriveStatus(d),
    createdAt: creationTimestampIso(d),
  };
}

/** List Pier-managed apps in a namespace (label pier.app must be present).
 * Skips Deployments with deletionTimestamp set (being terminated).
 */
export async function listApps(
  apps: AppsV1Api,
  namespace: string,
): Promise<App[]> {
  const response = await apps.listNamespacedDeployment({
    namespace,
    labelSelector: appSelector(),
  });

  // Filter out Deployments with deletionTimestamp (being terminated).
  const liveDeployments = (response.items ?? []).filter(
    (d) => !d.metadata?.deletionTimestamp,
  );

  const appList = liveDeployments.map(deploymentToApp);
  appList.sort((a, b) => a.name.localeCompare(b.name));
  return appList;
}
