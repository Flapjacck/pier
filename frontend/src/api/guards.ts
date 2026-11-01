import type {
  App,
  AppPod,
  AppStatus,
  ClusterHealth,
  ClusterPodsResult,
  KubeConfigMode,
  PodSummary,
  RestartResult,
  SessionInfo,
} from "./types";

const APP_STATUSES: readonly AppStatus[] = ["running", "stopped", "building", "failed"];
const KUBE_MODES: readonly KubeConfigMode[] = ["in-cluster", "kubeconfig"];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isApiErrorBody(value: unknown): value is { ok: false; error: string; details?: string } {
  return isRecord(value) && value.ok === false && typeof value.error === "string";
}

function isKubeMode(value: unknown): value is KubeConfigMode {
  return typeof value === "string" && (KUBE_MODES as readonly string[]).includes(value);
}

function isAppStatus(value: unknown): value is AppStatus {
  return typeof value === "string" && (APP_STATUSES as readonly string[]).includes(value);
}

export function parseSessionInfo(json: unknown): SessionInfo {
  if (!isRecord(json) || json.ok !== true || typeof json.authDisabled !== "boolean") {
    throw new SyntaxError("Invalid session response");
  }
  // ingressDomain is optional (null or string); default to null for backward compatibility
  const ingressDomain =
    typeof json.ingressDomain === "string" ? json.ingressDomain : null;
  return { ok: true, authDisabled: json.authDisabled, ingressDomain };
}

export function parseApp(json: unknown): App {
  if (
    !isRecord(json) ||
    typeof json.name !== "string" ||
    typeof json.image !== "string" ||
    typeof json.replicas !== "number" ||
    typeof json.ready !== "number" ||
    !isAppStatus(json.status) ||
    typeof json.createdAt !== "string"
  ) {
    throw new SyntaxError("Invalid app response");
  }
  const app: App = {
    name: json.name,
    image: json.image,
    replicas: json.replicas,
    ready: json.ready,
    status: json.status,
    createdAt: json.createdAt,
  };
  if (typeof json.port === "number") app.port = json.port;
  if (typeof json.host === "string") app.host = json.host;
  if (typeof json.url === "string") app.url = json.url;
  return app;
}

export function parseAppList(json: unknown): App[] {
  if (!Array.isArray(json)) throw new SyntaxError("Invalid apps list");
  return json.map(parseApp);
}

export function parseAppPod(json: unknown): AppPod {
  if (
    !isRecord(json) ||
    typeof json.name !== "string" ||
    typeof json.phase !== "string" ||
    typeof json.ready !== "boolean" ||
    typeof json.readyContainers !== "string" ||
    typeof json.restarts !== "number"
  ) {
    throw new SyntaxError("Invalid app pod response");
  }
  const pod: AppPod = {
    name: json.name,
    phase: json.phase,
    ready: json.ready,
    readyContainers: json.readyContainers,
    restarts: json.restarts,
  };
  if (typeof json.node === "string") pod.node = json.node;
  if (typeof json.startedAt === "string") pod.startedAt = json.startedAt;
  if (typeof json.waitingReason === "string") pod.waitingReason = json.waitingReason;
  if (typeof json.lastTerminationReason === "string") {
    pod.lastTerminationReason = json.lastTerminationReason;
  }
  return pod;
}

export function parseAppPodList(json: unknown): AppPod[] {
  if (!Array.isArray(json)) throw new SyntaxError("Invalid app pods list");
  return json.map(parseAppPod);
}

function parsePodSummary(json: unknown): PodSummary {
  if (
    !isRecord(json) ||
    typeof json.name !== "string" ||
    typeof json.namespace !== "string" ||
    typeof json.phase !== "string" ||
    typeof json.ready !== "string"
  ) {
    throw new SyntaxError("Invalid pod summary");
  }
  const row: PodSummary = {
    name: json.name,
    namespace: json.namespace,
    phase: json.phase,
    ready: json.ready,
  };
  if (typeof json.nodeName === "string") row.nodeName = json.nodeName;
  if (typeof json.startedAt === "string") row.startedAt = json.startedAt;
  return row;
}

export function parseClusterPodsResult(json: unknown): ClusterPodsResult {
  if (!isRecord(json) || typeof json.ok !== "boolean" || !isKubeMode(json.mode)) {
    throw new SyntaxError("Invalid cluster pods response");
  }
  const result: ClusterPodsResult = { ok: json.ok, mode: json.mode };
  if (typeof json.error === "string") result.error = json.error;
  if (typeof json.total === "number") result.total = json.total;
  if (Array.isArray(json.pods)) result.pods = json.pods.map(parsePodSummary);
  return result;
}

export function parseClusterHealth(json: unknown): ClusterHealth {
  if (!isRecord(json) || typeof json.ok !== "boolean" || !isKubeMode(json.mode)) {
    throw new SyntaxError("Invalid cluster health response");
  }
  const health: ClusterHealth = { ok: json.ok, mode: json.mode };
  if (typeof json.version === "string") health.version = json.version;
  if (isRecord(json.nodes) && typeof json.nodes.total === "number" && typeof json.nodes.ready === "number") {
    health.nodes = { total: json.nodes.total, ready: json.nodes.ready };
  }
  if (typeof json.error === "string") health.error = json.error;
  return health;
}

export function parseRestartResult(json: unknown): RestartResult {
  if (!isRecord(json) || json.ok !== true || typeof json.restartedAt !== "string") {
    throw new SyntaxError("Invalid restart response");
  }
  return { ok: true, restartedAt: json.restartedAt };
}
