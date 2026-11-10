/** Shared build types (#83). No Kubernetes or SQLite imports. */

/** Railpack auto-detects the stack (default); dockerfile uses the repo's own Dockerfile. */
export type BuildMethod = "railpack" | "dockerfile";
export const BUILD_METHODS: readonly BuildMethod[] = ["railpack", "dockerfile"];

/** Where an app's image is built from. Never carries a token: gitCredential is a name. */
export type BuildSource = {
  method: BuildMethod;
  repo: string;
  branch: string;
  /** Build context, relative to the repo root ("." for the root). */
  folder: string;
  /** Dockerfile path relative to `folder`. Only used by the dockerfile method. */
  dockerfile: string;
  gitCredential?: string;
};

export type VolumeHintSource = "image" | "compose" | "fly" | "dependency" | "files";
export type VolumeHintConfidence = "high" | "medium" | "low";

/** A path that probably needs to survive restarts. Suggestions only: never auto-attached. */
export type VolumeHint = {
  path: string;
  reason: string;
  source: VolumeHintSource;
  confidence: VolumeHintConfidence;
};
