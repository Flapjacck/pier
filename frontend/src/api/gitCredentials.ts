import { request, type RequestOptions } from "./request";
import type { GitCredential } from "./types";

function parseList(value: unknown): GitCredential[] {
  if (!value || typeof value !== "object") return [];
  const credentials = (value as { credentials?: unknown }).credentials;
  return Array.isArray(credentials) ? (credentials as GitCredential[]) : [];
}

export function listGitCredentials(options?: RequestOptions): Promise<GitCredential[]> {
  return request("/api/git-credentials", { ...options, parse: parseList });
}
