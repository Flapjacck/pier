import type { ImageInspection } from "../../images/inspect.js";
import type { BuildMethod, VolumeHint } from "../types.js";
import { committedFileHints } from "./repo-files.js";
import { composeHints, dependencyHints, dockerfileInfo, flyHints, looksStatic } from "./manifests.js";
import { containerPath, mergeHints } from "./merge.js";

/**
 * Suggested volumes for a build-from-repo app (#83 items 21–23). Only suggestions: the
 * wizard shows them with a reason and confidence, and nothing is created until Deploy.
 */

export type RepoView = {
  /** Every path in the repo tree, repo-relative. */
  files: string[];
  /** Build folder ("." for the root). */
  folder: string;
  method: BuildMethod;
  /** Dockerfile path relative to the folder (dockerfile method). */
  dockerfile?: string;
  /** Read a file by repo-relative path; undefined when missing or too big. */
  read: (path: string) => Promise<string | undefined>;
};

/** Railpack builds into /app; a Dockerfile's last WORKDIR wins. */
const RAILPACK_WORKDIR = "/app";
const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

export async function repoVolumeHints(view: RepoView): Promise<VolumeHint[]> {
  const prefix = view.folder === "." || view.folder === "" ? "" : `${view.folder.replace(/\/+$/, "")}/`;
  const inFolder = view.files.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length));
  const set = new Set(inFolder);
  const read = (rel: string) => view.read(`${prefix}${rel}`);

  if (looksStatic(set, set.has("package.json") ? await read("package.json") : undefined)) return [];

  let workdir = RAILPACK_WORKDIR;
  const hints: VolumeHint[] = [];
  if (view.method === "dockerfile") {
    const text = await read(view.dockerfile ?? "Dockerfile");
    if (text) {
      const info = dockerfileInfo(text);
      workdir = info.workdir ?? workdir;
      hints.push(...info.volumes);
    }
  }
  for (const file of COMPOSE_FILES) {
    const text = set.has(file) ? await read(file) : undefined;
    if (text) hints.push(...composeHints(text, file));
  }
  const fly = set.has("fly.toml") ? await read("fly.toml") : undefined;
  if (fly) hints.push(...flyHints(fly));
  hints.push(...(await dependencyHints(read, set, workdir)));
  hints.push(...committedFileHints(inFolder, workdir));
  return mergeHints(hints);
}

/** The built image's own VOLUME lines; a Caddy-served image is a static site with no hints. */
export function imageVolumeHints(image: Pick<ImageInspection, "volumes" | "command">): { hints: VolumeHint[]; static: boolean } {
  // Railpack serves static sites with Caddy, whether Cmd is ["caddy", ...] or a shell line.
  const isStatic = /(^|[\s/])caddy(\s|$)/.test((image.command ?? []).join(" "));
  if (isStatic) return { hints: [], static: true };
  const hints = image.volumes.flatMap((v): VolumeHint[] => {
    const path = containerPath(v);
    return path ? [{ path, source: "image", confidence: "high", reason: `The built image declares VOLUME ${path}.` }] : [];
  });
  return { hints, static: false };
}

/** Everything we know after a build: the image wins on "static", otherwise both lists merge. */
export function combineHints(repo: VolumeHint[], image?: { hints: VolumeHint[]; static: boolean }): VolumeHint[] {
  if (image?.static) return [];
  return mergeHints([...(image?.hints ?? []), ...repo]);
}
