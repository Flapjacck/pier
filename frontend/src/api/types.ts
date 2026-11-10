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
 * - backend/src/deploys/serialize.ts and types.ts (DeploySummary, DeployDetail)
 * - ./sourceTypes.ts (build from git, #83)
 */
import type { AppSource, SourceBody, VolumeHint } from "./sourceTypes";
export type { AppSource, BuildMethod, GitCredential, GitProbeBody, GitProbeResult, SourceBody, VolumeHint } from "./sourceTypes";
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
  registry?: string | null;
  /** Deploy record started by a create/PATCH (#81); absent on reads. */
  deploymentId?: number;
  /** Set when the app is built from git (#83); the repo is its primary identity. */
  source?: AppSource;
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
  /** Exactly one of image (pre-built) and source (build from git, #83). */
  image?: string;
  source?: SourceBody;
  port: number;
  replicas?: number;
  host?: string;
  env?: Record<string, string>;
  resources?: PartialAppResources;
  volumes?: VolumeMount[];
  registry?: string;
};

/** PATCH /api/apps/:name body — at least one field; env replaces the whole set. */
export type UpdateAppBody = {
  image?: string;
  port?: number;
  replicas?: number;
  env?: Record<string, string>;
  resources?: PartialAppResources;
  volumes?: VolumeMount[];
  registry?: string | null;
};

export type Registry = {
  name: string;
  server: string;
  username: string;
  createdAt: string;
};

export type ImageInspection = {
  image: string;
  digest: string;
  exposedPorts: number[];
  volumes: string[];
  workingDir?: string;
  defaultUser?: string;
  volumeHints: VolumeHint[];
};

export type ScaleBody = {
  replicas: number;
};

export type RestartResult = {
  ok: true;
  restartedAt: string;
  deploymentId?: number;
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

/** One audit detail value. The backend never stores env values, tokens or cookies. */
export type AuditDetailValue = string | number | boolean | string[];

/** GET /api/audit entry: one successful change made through Pier. */
export type AuditEntry = {
  id: number;
  /** ISO 8601 time of the request. */
  ts: string;
  actor: "token" | "session" | "pier";
  ip: string;
  /** e.g. "app.create", "app.scale", "volume.delete", "session.login". */
  action: string;
  app: string | null;
  /** Pod or volume name when that, not the app, was acted on. */
  target: string | null;
  status: number;
  details: Record<string, AuditDetailValue>;
};

export type AuditPage = {
  entries: AuditEntry[];
  /** Pass as `before` for the next (older) page; null when there are no more. */
  nextBefore: number | null;
};

/** What started a deploy. rollback (#87) and build (#83) are reserved. */
export type DeployTrigger = "create" | "patch" | "restart" | "rollback" | "build";
export type DeployStatus = "running" | "succeeded" | "failed" | "cancelled";
export type DeployStepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
export type DeployStepName = "validate" | "build" | "apply" | "schedule" | "pull" | "start" | "health" | "ready";
export type DeployLine = { ts: string; level: "info" | "warning" | "error"; text: string };

/** What a deploy asked for. Env key names only, never values. */
export type DeploySpec = {
  image?: string;
  port?: number;
  replicas?: number;
  host?: string;
  envKeys?: string[];
};

export type DeploySummary = {
  id: number;
  app: string;
  trigger: DeployTrigger;
  status: DeployStatus;
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  spec: DeploySpec;
  currentStep: DeployStepName | null;
};

export type DeployStep = {
  name: DeployStepName;
  label: string;
  status: DeployStepStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  lines: DeployLine[];
};

export type DeployDetail = DeploySummary & { steps: DeployStep[] };

export type DeployPage = { deployments: DeploySummary[]; nextBefore: number | null };
