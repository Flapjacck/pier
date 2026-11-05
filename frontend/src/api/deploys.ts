import { parseDeployPage, parseDeployResponse } from "./deployGuards";
import { request, type RequestOptions } from "./request";
import type { DeployDetail, DeployPage } from "./types";

/** Deploy history API (#81). Re-exported from client.ts. */

const base = (name: string) => `/api/apps/${encodeURIComponent(name)}/deployments`;

export type DeploymentsQuery = { limit?: number; before?: number };

/** GET /api/apps/:name/deployments — newest first; pass nextBefore as `before` for older ones. */
export function listDeployments(name: string, query: DeploymentsQuery = {}, options?: RequestOptions): Promise<DeployPage> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.before !== undefined) params.set("before", String(query.before));
  const qs = params.toString();
  return request(`${base(name)}${qs ? `?${qs}` : ""}`, { ...options, parse: parseDeployPage });
}

/** GET /api/apps/:name/deployments/:id — one deploy with its steps and output lines. */
export function getDeployment(name: string, id: number, options?: RequestOptions): Promise<DeployDetail> {
  return request(`${base(name)}/${id}`, { ...options, parse: parseDeployResponse });
}

/** Relative SSE URL for a live deploy (`deployment` and `end` events); does not fetch. */
export function deploymentStreamUrl(name: string, id: number): string {
  return `${base(name)}/${id}/stream`;
}
