/**
 * Hand-written API types — keep in sync with:
 * - backend/src/k8s/apps.ts (App, AppStatus)
 * - backend/src/k8s/app-pods.ts (AppPod)
 * - backend/src/k8s/list-pods.ts (PodSummary, ClusterPodsResult)
 * - backend/src/k8s/cluster-health.ts (ClusterHealth)
 * - backend/src/k8s/client.ts (KubeConfigMode)
 * - backend/src/routes/apps-schemas.ts (PostAppsBody, error bodies)
 * - backend/src/routes/apps/restart.ts (RestartResult)
 * - backend/src/routes/session.ts (SessionInfo)
 */

export type KubeConfigMode = "in-cluster" | "kubeconfig";

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

export type AppPod = {
  name: string;
  phase: string;
  ready: boolean;
  readyContainers: string;
  restarts: number;
  node?: string;
  startedAt?: string;
  waitingReason?: string;
  lastTerminationReason?: string;
};

export type PodSummary = {
  name: string;
  namespace: string;
  phase: string;
  nodeName?: string;
  ready: string;
  startedAt?: string;
};

export type ClusterHealth = {
  ok: boolean;
  mode: KubeConfigMode;
  version?: string;
  nodes?: { total: number; ready: number };
  error?: string;
};

export type ClusterPodsResult = {
  ok: boolean;
  mode: KubeConfigMode;
  pods?: PodSummary[];
  total?: number;
  error?: string;
};

export type SessionInfo = {
  ok: true;
  authDisabled: boolean;
};

/** POST /api/apps body — mirrors apps-schemas PostAppsBody */
export type CreateAppBody = {
  name: string;
  image: string;
  port: number;
  replicas?: number;
  host?: string;
  env?: Record<string, string>;
};

export type ScaleBody = {
  replicas: number;
};

export type RestartResult = {
  ok: true;
  restartedAt: string;
};

export type ApiErrorBody = {
  ok: false;
  error: string;
  details?: string;
};
