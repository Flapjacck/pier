import type {
  App,
  AppEvent,
  AppEventList,
  AppPod,
  AppResources,
  AppStatus,
  ClusterHealth,
  ClusterPodsResult,
  KubeConfigMode,
  PodSummary,
  ResourcePair,
  RestartResult,
  DeleteAppResult,
  SessionInfo,
  Volume,
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
function isVolumeStatus(value: unknown): value is Volume["status"] {
  return value === "pending" || value === "bound" || value === "lost";
}

export function parseSessionInfo(json: unknown): SessionInfo {
  if (!isRecord(json) || json.ok !== true || typeof json.authDisabled !== "boolean") {
    throw new SyntaxError("Invalid session response");
  }
  // ingressDomain is optional (null or string); default to null for backward compatibility
  const ingressDomain =
    typeof json.ingressDomain === "string" ? json.ingressDomain : null;
  // tls is optional too (older backends omit it); anything but true means HTTP.
  const tls = json.tls === true;
  return { ok: true, authDisabled: json.authDisabled, ingressDomain, tls };
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
  const env = parseStringRecord(json.env);
  if (env) app.env = env;
  const resources = parseResources(json.resources);
  if (resources) app.resources = resources;
  if (Array.isArray(json.volumes)) {
    const volumes = json.volumes.flatMap((item) => isRecord(item) && typeof item.name === "string" && typeof item.mountPath === "string" ? [{ name: item.name, mountPath: item.mountPath }] : []);
    if (volumes.length !== json.volumes.length) throw new SyntaxError("Invalid app volumes");
    app.volumes = volumes;
  }
  return app;
}

export function parseVolume(json: unknown): Volume {
  if (!isRecord(json) || typeof json.name !== "string" || typeof json.size !== "string" || !isVolumeStatus(json.status) || typeof json.createdAt !== "string") throw new SyntaxError("Invalid volume response");
  return { name: json.name, size: json.size, status: json.status, createdAt: json.createdAt, ...(typeof json.app === "string" ? { app: json.app } : {}), ...(typeof json.mountPath === "string" ? { mountPath: json.mountPath } : {}) };
}
export function parseVolumeList(json: unknown): Volume[] {
  if (!Array.isArray(json)) throw new SyntaxError("Invalid volume list");
  return json.map(parseVolume);
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v !== "string") return undefined;
    out[key] = v;
  }
  return out;
}

function parsePair(value: unknown): ResourcePair | undefined {
  if (!isRecord(value) || typeof value.cpu !== "string" || typeof value.memory !== "string") {
    return undefined;
  }
  return { cpu: value.cpu, memory: value.memory };
}

/** Resources are optional (older backends don't send them); a malformed object is dropped. */
function parseResources(value: unknown): AppResources | undefined {
  if (!isRecord(value)) return undefined;
  const requests = parsePair(value.requests);
  const limits = parsePair(value.limits);
  return requests && limits ? { requests, limits } : undefined;
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
  if (typeof json.image === "string") pod.image = json.image;
  if (typeof json.lastExitCode === "number") pod.lastExitCode = json.lastExitCode;
  return pod;
}

export function parseAppPodList(json: unknown): AppPod[] {
  if (!Array.isArray(json)) throw new SyntaxError("Invalid app pods list");
  return json.map(parseAppPod);
}

export function parseAppEvent(json: unknown): AppEvent {
  if (
    !isRecord(json) ||
    (json.type !== "Normal" && json.type !== "Warning") ||
    typeof json.reason !== "string" ||
    typeof json.message !== "string" ||
    !isRecord(json.object) ||
    typeof json.object.kind !== "string" ||
    typeof json.object.name !== "string" ||
    typeof json.count !== "number"
  ) {
    throw new SyntaxError("Invalid app event response");
  }
  const event: AppEvent = {
    type: json.type,
    reason: json.reason,
    message: json.message,
    object: { kind: json.object.kind, name: json.object.name },
    count: json.count,
  };
  if (typeof json.summary === "string") event.summary = json.summary;
  if (typeof json.firstSeen === "string") event.firstSeen = json.firstSeen;
  if (typeof json.lastSeen === "string") event.lastSeen = json.lastSeen;
  return event;
}

export function parseAppEventList(json: unknown): AppEventList {
  if (!isRecord(json) || !Array.isArray(json.events)) throw new SyntaxError("Invalid app events list");
  return { events: json.events.map(parseAppEvent) };
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

export function parseDeleteAppResult(json: unknown): DeleteAppResult {
  if (json === null) return { ok: true, dataRetained: false, volumeErrors: [] }; // 204: deleted, volumes kept
  if (!isRecord(json) || json.ok !== true || typeof json.dataRetained !== "boolean" || !Array.isArray(json.volumeErrors) || !json.volumeErrors.every((value) => typeof value === "string")) {
    throw new SyntaxError("Invalid app delete response");
  }
  return { ok: true, dataRetained: json.dataRetained, volumeErrors: json.volumeErrors };
}
