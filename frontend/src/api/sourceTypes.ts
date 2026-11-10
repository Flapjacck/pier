/**
 * Build-from-git types (#83). Mirrors backend/src/routes/apps-source-schemas.ts,
 * git-probe.ts and git-credentials.ts. No type here ever carries a git token.
 */

export type BuildMethod = "railpack" | "dockerfile";

export type VolumeHint = {
  path: string;
  reason: string;
  source: "image" | "compose" | "fly" | "dependency" | "files";
  confidence: "high" | "medium" | "low";
};

/** POST /api/apps `source` (instead of `image`). */
export type SourceBody = {
  method?: BuildMethod;
  repo: string;
  branch?: string;
  folder?: string;
  dockerfile?: string;
  gitCredential?: string;
};

/** What an app says about where it is built from. */
export type AppSource = {
  method: BuildMethod;
  repo: string;
  branch: string;
  folder: string;
  dockerfile: string;
  gitCredential?: string;
  lastCommit: string | null;
  lastImage: string | null;
  volumeHints: VolumeHint[];
};

export type GitProbeBody = {
  repo: string;
  gitCredential?: string;
  branch?: string;
  /** Hints are only computed once a folder is known. */
  folder?: string;
  method?: BuildMethod;
  dockerfile?: string;
};

export type GitProbeResult = {
  defaultBranch: string;
  branches: string[];
  folders: string[];
  dockerfiles: string[];
  volumeHints: VolumeHint[];
};

export type GitCredential = { name: string; username: string; createdAt: string };
