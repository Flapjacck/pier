import { request, requestVoid, type RequestOptions } from "./request";
import { parseGitCredential, parseGitCredentialList, parseGitProbe, parseRedeploy } from "./sourceGuards";
import type { GitCredential, GitProbeBody, GitProbeResult } from "./sourceTypes";

/** Build-from-git endpoints (#83). Tokens are sent once on create/replace and never read back. */

export function probeGitRepo(body: GitProbeBody, options?: RequestOptions): Promise<GitProbeResult> {
  return request("/api/git/probe", { ...options, method: "POST", body, parse: parseGitProbe });
}

/** Rebuild from the latest commit on the saved branch; follow the returned deploy. */
export function redeployApp(name: string, options?: RequestOptions): Promise<{ deploymentId: number }> {
  return request(`/api/apps/${encodeURIComponent(name)}/redeploy`, { ...options, method: "POST", parse: parseRedeploy });
}

export function listGitCredentials(options?: RequestOptions): Promise<GitCredential[]> {
  return request("/api/git-credentials", { ...options, parse: parseGitCredentialList });
}

export function createGitCredential(body: { name: string; username: string; token: string }, options?: RequestOptions): Promise<GitCredential> {
  return request("/api/git-credentials", {
    ...options, method: "POST", body,
    parse: (value) => parseGitCredential((value as { credential?: unknown }).credential),
  });
}

export function updateGitCredential(name: string, body: { username?: string; token?: string }, options?: RequestOptions): Promise<GitCredential> {
  return request(`/api/git-credentials/${encodeURIComponent(name)}`, {
    ...options, method: "PATCH", body,
    parse: (value) => parseGitCredential((value as { credential?: unknown }).credential),
  });
}

export function deleteGitCredential(name: string, options?: RequestOptions): Promise<void> {
  return requestVoid(`/api/git-credentials/${encodeURIComponent(name)}`, { ...options, method: "DELETE" });
}
