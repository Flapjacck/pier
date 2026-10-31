import type { AppsV1Api, NetworkingV1Api, V1Deployment, V1DeploymentCondition, V1Ingress } from "@kubernetes/client-node";
import { APP_LABEL, appSelector, MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "./labels.js";

export type AppStatus = "running" | "stopped" | "building" | "failed";

export type App = {
  name: string;
  image: string;
  replicas: number;
  ready: number;
  status: AppStatus;
  createdAt: string;
  port?: number;
  host?: string;
  url?: string;
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

/** Extract the container port from a Deployment.
 * Returns the port number from containers[0]'s port named 'http', or the first port if no 'http' port is found.
 * Returns undefined if no ports are defined.
 */
export function deploymentPort(d: V1Deployment): number | undefined {
  const ports = d.spec?.template?.spec?.containers?.[0]?.ports;
  if (!ports || ports.length === 0) {
    return undefined;
  }

  // Prefer the port named 'http'.
  const httpPort = ports.find((p) => p.name === "http");
  if (httpPort?.containerPort) {
    return httpPort.containerPort;
  }

  // Fall back to the first port.
  return ports[0]?.containerPort;
}

/** Extract the host from an Ingress.
 * Returns the first rule's host, lowercased, or undefined if no rules are present.
 */
export function ingressHost(ing: V1Ingress): string | undefined {
  const host = ing.spec?.rules?.[0]?.host;
  return host ? host.toLowerCase() : undefined;
}

/** Generate the URL for an app given its host.
 * Returns http://host; switches to https:// when #29 (TLS) lands.
 */
export function appUrl(host: string): string {
  return `http://${host}`;
}

/** Pure mapping from a namespaced Deployment to the public App shape.
 * If host is provided, sets host and url in the response.
 * Sets port when the Deployment has ports defined.
 * Omits keys with undefined values.
 */
export function deploymentToApp(d: V1Deployment, host?: string): App {
  const replicas = d.spec?.replicas ?? 1;
  const ready = d.status?.readyReplicas ?? 0;
  const name =
    d.metadata?.labels?.[APP_LABEL] ?? d.metadata?.name ?? "";
  const image =
    d.spec?.template?.spec?.containers?.[0]?.image ?? "";
  const port = deploymentPort(d);

  const app: App = {
    name,
    image,
    replicas,
    ready,
    status: deriveStatus(d),
    createdAt: creationTimestampIso(d),
  };

  if (port !== undefined) {
    app.port = port;
  }

  if (host) {
    app.host = host;
    app.url = appUrl(host);
  }

  return app;
}

/** List Pier-managed apps in a namespace (label pier.app must be present).
 * Skips Deployments with deletionTimestamp set (being terminated).
 * Fetches Ingresses to populate host and url fields when available.
 * Makes one Ingress list call for all Pier-managed apps.
 */
export async function listApps(
  clients: { apps: AppsV1Api; networking: NetworkingV1Api },
  namespace: string,
): Promise<App[]> {
  // Fetch Deployments and Ingresses in parallel.
  const [deployResponse, ingressResponse] = await Promise.all([
    clients.apps.listNamespacedDeployment({
      namespace,
      labelSelector: appSelector(),
    }),
    clients.networking.listNamespacedIngress({
      namespace,
      labelSelector: `${MANAGED_BY_LABEL}=${MANAGED_BY_VALUE}`,
    }),
  ]);

  // Filter out Deployments with deletionTimestamp (being terminated).
  const liveDeployments = (deployResponse.items ?? []).filter(
    (d) => !d.metadata?.deletionTimestamp,
  );

  // Build a Map<appName, host> from non-terminating Ingresses with pier.app label.
  const hosts = new Map<string, string>();
  for (const ingress of ingressResponse.items ?? []) {
    if (ingress.metadata?.deletionTimestamp) {
      continue;
    }
    const appName = ingress.metadata?.labels?.[APP_LABEL];
    if (!appName) {
      continue;
    }
    const host = ingressHost(ingress);
    if (host) {
      hosts.set(appName, host);
    }
  }

  // Convert Deployments to Apps, passing the host if available.
  const appList = liveDeployments.map((d) => {
    const appName = d.metadata?.labels?.[APP_LABEL] ?? d.metadata?.name ?? "";
    return deploymentToApp(d, hosts.get(appName));
  });

  appList.sort((a, b) => a.name.localeCompare(b.name));
  return appList;
}
