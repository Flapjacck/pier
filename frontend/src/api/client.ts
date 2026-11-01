import {
  parseApp,
  parseAppList,
  parseAppPodList,
  parseClusterHealth,
  parseClusterPodsResult,
  parseSessionInfo,
} from "./guards";
import { request, requestVoid, type RequestOptions } from "./request";
import type { App, ClusterHealth, ClusterPodsResult, CreateAppBody, ScaleBody, SessionInfo } from "./types";

export { ApiError, type ApiErrorKind } from "./errors";
export type {
  App,
  AppPod,
  AppStatus,
  ClusterHealth,
  ClusterPodsResult,
  CreateAppBody,
  PodSummary,
  ScaleBody,
  SessionInfo,
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

export function restartApp(name: string, options?: RequestOptions): Promise<App> {
  return request(`/api/apps/${encodeURIComponent(name)}/restart`, {
    ...options,
    method: "POST",
    parse: parseApp,
  });
}

export function deleteApp(name: string, options?: RequestOptions): Promise<void> {
  return requestVoid(`/api/apps/${encodeURIComponent(name)}`, {
    ...options,
    method: "DELETE",
  });
}

export function listAppPods(name: string, options?: RequestOptions) {
  return request(`/api/apps/${encodeURIComponent(name)}/pods`, {
    ...withSignal(options),
    parse: parseAppPodList,
  });
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
  opts: { follow?: boolean; pod?: string; tail?: number } = {},
): string {
  const params = new URLSearchParams();
  if (opts.follow) params.set("follow", "true");
  if (opts.pod) params.set("pod", opts.pod);
  if (opts.tail !== undefined) params.set("tail", String(opts.tail));
  const query = params.toString();
  return `/api/apps/${encodeURIComponent(name)}/logs${query ? `?${query}` : ""}`;
}
