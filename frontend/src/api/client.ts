import {
  parseApp,
  parseAppEventList,
  parseAppList,
  parseAppPodList,
  parseClusterHealth,
  parseClusterPodsResult,
  parseDeleteAppResult,
  parseRestartResult,
  parseSessionInfo,
  parseVolume, parseVolumeList,
} from "./guards";
import { parseAuditPage } from "./auditGuards";
import { request, requestVoid, type RequestOptions } from "./request";
import type {
  App,
  AppEventList,
  AuditPage,
  ClusterHealth,
  ClusterPodsResult,
  CreateAppBody,
  RestartResult,
  DeleteAppResult,
  ScaleBody,
  SessionInfo,
  UpdateAppBody,
  Volume,
} from "./types";

export { ApiError, type ApiErrorKind } from "./errors";
export type {
  App,
  AppEvent,
  AppEventList,
  AppPod,
  AppResources,
  AppStatus,
  AuditDetailValue,
  AuditEntry,
  AuditPage,
  ClusterHealth,
  ClusterPodsResult,
  CreateAppBody,
  PartialAppResources,
  PodSummary,
  ResourcePair,
  RestartResult,
  ScaleBody,
  SessionInfo,
  UpdateAppBody,
  Volume, VolumeMount,
} from "./types";

function withSignal(options: RequestOptions | undefined, signal?: AbortSignal): RequestOptions {
  return { ...options, signal: options?.signal ?? signal };
}

export function login(token: string, options?: RequestOptions): Promise<void> {
  return requestVoid("/api/login", {
    ...options,
    method: "POST",
    body: { token },
    skipAuthRedirect: true,
  });
}

export function logout(options?: RequestOptions): Promise<void> {
  return requestVoid("/api/logout", { ...options, method: "POST", skipAuthRedirect: true });
}

export function getSession(options?: RequestOptions): Promise<SessionInfo> {
  return request("/api/session", {
    ...withSignal(options),
    skipAuthRedirect: true,
    parse: parseSessionInfo,
  });
}

export function getClusterHealth(options?: RequestOptions): Promise<ClusterHealth> {
  return request("/api/cluster/health", {
    ...withSignal(options),
    parse: parseClusterHealth,
  });
}

export function listApps(options?: RequestOptions): Promise<App[]> {
  return request("/api/apps", { ...withSignal(options), parse: parseAppList });
}

export function getApp(name: string, options?: RequestOptions): Promise<App> {
  return request(`/api/apps/${encodeURIComponent(name)}`, {
    ...withSignal(options),
    parse: parseApp,
  });
}

export function createApp(body: CreateAppBody, options?: RequestOptions): Promise<App> {
  return request("/api/apps", {
    ...options,
    method: "POST",
    body,
    parse: parseApp,
  });
}

export function scaleApp(name: string, replicas: number, options?: RequestOptions): Promise<App> {
  const body: ScaleBody = { replicas };
  return request(`/api/apps/${encodeURIComponent(name)}/scale`, {
    ...options,
    method: "PATCH",
    body,
    parse: parseApp,
  });
}

/** PATCH /api/apps/:name — change image, port, env, replicas and/or resources. */
export function updateApp(name: string, body: UpdateAppBody, options?: RequestOptions): Promise<App> {
  return request(`/api/apps/${encodeURIComponent(name)}`, {
    ...options,
    method: "PATCH",
    body,
    parse: parseApp,
  });
}

export function restartApp(name: string, options?: RequestOptions): Promise<RestartResult> {
  return request(`/api/apps/${encodeURIComponent(name)}/restart`, {
    ...options,
    method: "POST",
    parse: parseRestartResult,
  });
}

export function deleteApp(name: string, opts: { deleteVolumes?: boolean } = {}, options?: RequestOptions): Promise<DeleteAppResult> {
  const query = opts.deleteVolumes ? "?deleteVolumes=true" : "";
  return request(`/api/apps/${encodeURIComponent(name)}${query}`, {
    ...options,
    method: "DELETE",
    parse: parseDeleteAppResult,
  });
}

export function listVolumes(options?: RequestOptions): Promise<Volume[]> {
  return request("/api/volumes", { ...withSignal(options), parse: parseVolumeList });
}
export function createVolume(body: { name: string; size: string }, options?: RequestOptions): Promise<Volume> {
  return request("/api/volumes", { ...options, method: "POST", body, parse: parseVolume });
}
export function deleteVolume(name: string, options?: RequestOptions): Promise<{ ok: true; dataRetained: boolean }> {
  return request(`/api/volumes/${encodeURIComponent(name)}`, { ...options, method: "DELETE", parse: (value) => {
    if (!isRecordResponse(value)) throw new SyntaxError("Invalid volume delete response");
    return { ok: true, dataRetained: value.dataRetained === true };
  } });
}
function isRecordResponse(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && "dataRetained" in value && typeof value.dataRetained === "boolean";
}

export function listAppPods(name: string, options?: RequestOptions) {
  return request(`/api/apps/${encodeURIComponent(name)}/pods`, {
    ...withSignal(options),
    parse: parseAppPodList,
  });
}

export function deleteAppPod(name: string, pod: string, options?: RequestOptions): Promise<void> {
  return requestVoid(`/api/apps/${encodeURIComponent(name)}/pods/${encodeURIComponent(pod)}`, {
    ...withSignal(options),
    method: "DELETE",
  });
}

export const deletePod = deleteAppPod;

export function listAppEvents(name: string, options?: RequestOptions & { limit?: number }): Promise<AppEventList> {
  const limit = options?.limit;
  const requestOptions = { ...options };
  delete requestOptions.limit;
  const query = limit === undefined ? "" : `?limit=${encodeURIComponent(String(limit))}`;
  return request(`/api/apps/${encodeURIComponent(name)}/events${query}`, {
    ...withSignal(requestOptions),
    ...(limit === undefined ? {} : { query: { limit } }),
    parse: parseAppEventList,
  });
}

export type AuditQuery = { limit?: number; before?: number; app?: string };

/** GET /api/audit — newest first; pass page.nextBefore as `before` for older entries. */
export function listAudit(query: AuditQuery = {}, options?: RequestOptions): Promise<AuditPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const qs = params.toString();
  return request(`/api/audit${qs ? `?${qs}` : ""}`, { ...withSignal(options), parse: parseAuditPage });
}

export function listClusterPods(options?: RequestOptions): Promise<ClusterPodsResult> {
  return request("/api/cluster/pods", {
    ...withSignal(options),
    parse: parseClusterPodsResult,
  });
}

/** Relative URL for log streaming (#47); does not fetch. */
export function appLogsUrl(
  name: string,
  opts: { follow?: boolean; pod?: string; tail?: number; previous?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (opts.follow) params.set("follow", "true");
  if (opts.pod) params.set("pod", opts.pod);
  if (opts.tail !== undefined) params.set("tail", String(opts.tail));
  if (opts.previous) params.set("previous", "true");
  const query = params.toString();
  return `/api/apps/${encodeURIComponent(name)}/logs${query ? `?${query}` : ""}`;
}

export function appPodLogsUrl(name: string, pod: string): string {
  return appLogsUrl(name, { pod, tail: 500, previous: true });
}

/** Fetch plain text logs for an app (follow=false). */
export function getAppLogsText(
  name: string,
  opts: { pod?: string; tail?: number; previous?: boolean } = {},
  options?: RequestOptions,
): Promise<string> {
  const url = appLogsUrl(name, { pod: opts.pod, tail: opts.tail, previous: opts.previous });
  return request(url, { ...withSignal(options), parseAsText: true });
}
