import { request, type RequestOptions } from "./request";

export type GitProbeResult = {
  defaultBranch: string;
  branches: string[];
  folders: string[];
};

type ProbeBody = { repo: string; gitCredential?: string };

function parseProbe(data: unknown): GitProbeResult {
  const obj = data as GitProbeResult;
  if (!obj || !Array.isArray(obj.branches) || !Array.isArray(obj.folders) || typeof obj.defaultBranch !== "string") {
    throw new Error("invalid git probe response");
  }
  return obj;
}

/** POST /api/git/probe — branches + folders for the deploy wizard. */
export function probeGitRepo(body: ProbeBody, options?: RequestOptions): Promise<GitProbeResult> {
  return request("/api/git/probe", {
    ...options,
    method: "POST",
    body,
    parse: parseProbe,
  });
}
