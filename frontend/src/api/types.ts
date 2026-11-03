/**
 * Hand-written API types — keep in sync with:
 * - backend/src/k8s/apps.ts (App, AppStatus)
 * - backend/src/k8s/app-pods.ts (AppPod)
 * - backend/src/k8s/app-events.ts (AppEvent)
 * - backend/src/k8s/list-pods.ts (PodSummary, ClusterPodsResult)
 * - backend/src/k8s/cluster-health.ts (ClusterHealth)
 * - backend/src/k8s/client.ts (KubeConfigMode)
 * - backend/src/k8s/resources.ts (AppResources, PartialAppResources)
 * - backend/src/routes/apps-schemas.ts (PostAppsBody, PatchAppBody, error bodies)
 * - backend/src/routes/apps/restart.ts (RestartResult)
 * - backend/src/routes/session.ts (SessionInfo) — includes ingressDomain and tls
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
  /** Plain env values; omitted when the app has none. */
  env?: Record<string, string>;
  /** CPU/RAM requests and limits (always set by current backends). */
  resources?: AppResources;
  volumes?: { name: string; mountPath: string }[];
};
export type Volume = { name: string; size: string; status: "pending" | "bound" | "lost"; app?: string; mountPath?: string; createdAt: string };
export type VolumeMount = { name: string; mountPath: string; size?: string };

/** CPU and memory quantities, e.g. { cpu: "250m", memory: "256Mi" }. */
export type ResourcePair = { cpu: string; memory: string };

export type AppResources = { requests: ResourcePair; limits: ResourcePair };

/** Resources in a request body; missing fields keep the default (POST) or current value (PATCH). */
export type PartialAppResources = {
  requests?: Partial<ResourcePair>;
  limits?: Partial<ResourcePair>;
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
  image?: string;
  lastExitCode?: number;
};

export type AppEvent = {
  type: "Normal" | "Warning";
  reason: string;
  message: string;
  summary?: string;
  object: { kind: string; name: string };
  count: number;
  firstSeen?: string;
  lastSeen?: string;
};

export type AppEventList = {
  events: AppEvent[];
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
  ingressDomain: string | null;
  /** True when app Ingresses get TLS (backend PIER_TLS_ISSUER set). */
  tls: boolean;
};

/** POST /api/apps body — mirrors apps-schemas PostAppsBody */
export type CreateAppBody = {
  name: string;
  image: string;
  port: number;
  replicas?: number;
  host?: string;
  env?: Record<string, string>;
  resources?: PartialAppResources;
  volumes?: VolumeMount[];
};

/** PATCH /api/apps/:name body — at least one field; env replaces the whole set. */
export type UpdateAppBody = {
  image?: string;
  port?: number;
  replicas?: number;
  env?: Record<string, string>;
  resources?: PartialAppResources;
  volumes?: VolumeMount[];
};

export type ScaleBody = {
  replicas: number;
};

export type RestartResult = {
  ok: true;
  restartedAt: string;
};

export type DeleteAppResult = {
  ok: true;
  dataRetained: boolean;
  volumeErrors: string[];
};

export type ApiErrorBody = {
  ok: false;
  error: string;
  details?: string;
};
