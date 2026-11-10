import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BuildMethod, VolumeHint } from "./types.js";
import { repoVolumeHints } from "./volume-hints/index.js";

/**
 * Look inside a git repo for the deploy wizard (#83): branches, the default branch, and
 * the repo's folders and Dockerfiles. Only trees are fetched (blob:none, no checkout),
 * so a big repo costs a few hundred KB. A token reaches git through a credential helper
 * reading env, never the URL, so it can't show up in process args, errors or logs.
 */

const run = promisify(execFile);

export type GitAuth = { username: string; token: string };

export type GitProbeResult = {
  defaultBranch: string;
  branches: string[];
  /** Directories up to MAX_DEPTH deep, "." first. */
  folders: string[];
  /** Paths of files named Dockerfile or *.Dockerfile / Dockerfile.*. */
  dockerfiles: string[];
  /** Every file path in the tree (capped). */
  files: string[];
  /** Suggested volumes for hintsFor's folder; empty when not asked. */
  volumeHints: VolumeHint[];
};

export class GitProbeError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 502 = 502) {
    super(message);
    this.name = "GitProbeError";
  }
}

const MAX_DEPTH = 3;
const MAX_FOLDERS = 300;
export const MAX_FILES = 5000;
const HELPER = "!f() { echo \"username=$GIT_USERNAME\"; echo \"password=$GIT_PASSWORD\"; }; f";

export type ProbeOptions = {
  auth?: GitAuth;
  /** git's GIT_ALLOW_PROTOCOL. https only in production; tests add file. */
  protocols?: string;
  timeoutMs?: number;
  /** Probe this branch instead of the default one. */
  branch?: string;
  /** Work out volume hints for this build folder. */
  hintsFor?: { folder: string; method: BuildMethod; dockerfile?: string };
};

const MAX_READ = 256 * 1024;

function gitEnv(home: string, opts: ProbeOptions): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    // A throwaway HOME and no system config: the backend's own git config can't change behaviour.
    HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL: opts.protocols ?? "https",
    ...(opts.auth ? { GIT_USERNAME: opts.auth.username, GIT_PASSWORD: opts.auth.token } : {}),
  };
}

function stderrOf(err: unknown): string {
  const stderr = typeof err === "object" && err !== null && "stderr" in err ? String((err as { stderr: unknown }).stderr) : "";
  return `${err instanceof Error ? err.message : String(err)}\n${stderr}`;
}

/** Plain reason for a failed git call. Never echoes git's output, which could include the URL. */
export function probeFailure(err: unknown): GitProbeError {
  const text = stderrOf(err);
  if (/ENOENT|spawn git/i.test(text)) return new GitProbeError("git is not installed in the Pier backend image", 502);
  if (/Authentication failed|could not read (Username|Password)|terminal prompts disabled|403/i.test(text)) {
    return new GitProbeError("Repository not found, or it is private and needs a git credential that can read it", 404);
  }
  if (/not found|does not exist|404/i.test(text)) return new GitProbeError("Repository not found", 404);
  if (/Could not resolve host|timed out|ETIMEDOUT|SIGTERM/i.test(text)) return new GitProbeError("Could not reach the git host", 502);
  return new GitProbeError("Could not read the repository", 502);
}

/** Parse `git ls-remote --symref <url> HEAD refs/heads/*`. */
export function parseLsRemote(stdout: string): { defaultBranch?: string; branches: string[] } {
  let defaultBranch: string | undefined;
  const branches: string[] = [];
  for (const line of stdout.split("\n")) {
    const symref = /^ref: refs\/heads\/(\S+)\s+HEAD$/.exec(line.trim());
    if (symref?.[1]) defaultBranch = symref[1];
    const head = /^[0-9a-f]{40,64}\s+refs\/heads\/(\S+)$/.exec(line.trim());
    if (head?.[1]) branches.push(head[1]);
  }
  return { defaultBranch, branches: branches.sort((a, b) => a.localeCompare(b)) };
}

/** Folders and Dockerfiles from `git ls-tree -r --name-only HEAD`. */
export function summarizeTree(paths: string[]): Pick<GitProbeResult, "folders" | "dockerfiles" | "files"> {
  const folders = new Set<string>();
  const dockerfiles: string[] = [];
  for (const path of paths) {
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length && depth <= MAX_DEPTH; depth++) folders.add(parts.slice(0, depth).join("/"));
    const base = parts.at(-1) ?? "";
    if (/^Dockerfile(\..+)?$|\.Dockerfile$/i.test(base)) dockerfiles.push(path);
  }
  const sorted = [...folders].filter((f) => !f.split("/").some((p) => p === "node_modules" || p.startsWith("."))).sort((a, b) => a.localeCompare(b));
  return { folders: [".", ...sorted.slice(0, MAX_FOLDERS)], dockerfiles: dockerfiles.sort((a, b) => a.localeCompare(b)), files: paths.slice(0, MAX_FILES) };
}

/** git argv. Clears inherited helpers; with auth, adds one that reads the token from env. */
export function gitArgs(args: string[], auth: boolean): string[] {
  return ["-c", "credential.helper=", ...(auth ? ["-c", `credential.helper=${HELPER}`] : []), ...args];
}

/** remote is an already-validated clone URL (https, or file in tests). */
export async function probeGitRepo(remote: string, opts: ProbeOptions = {}): Promise<GitProbeResult> {
  const home = await mkdtemp(join(tmpdir(), "pier-git-probe-"));
  const env = gitEnv(home, opts);
  const timeout = opts.timeoutMs ?? 30_000;
  const git = (args: string[], cwd?: string) =>
    run("git", gitArgs(args, Boolean(opts.auth)), { env, cwd, timeout, maxBuffer: 16 * 1024 * 1024 });
  try {
    const listed = parseLsRemote((await git(["ls-remote", "--symref", "--", remote, "HEAD", "refs/heads/*"])).stdout);
    if (listed.branches.length === 0) throw new GitProbeError("The repository has no branches yet", 404);
    const defaultBranch = listed.defaultBranch ?? (listed.branches.includes("main") ? "main" : (listed.branches[0] as string));
    const branch = opts.branch ?? defaultBranch;
    if (!listed.branches.includes(branch)) throw new GitProbeError(`Branch ${branch} doesn't exist`, 404);
    const dir = join(home, "repo");
    await git(["clone", "--depth", "1", "--filter=blob:none", "--no-checkout", "--single-branch", "--branch", branch, "--", remote, dir]);
    const tree = (await git(["ls-tree", "-r", "--name-only", "HEAD"], dir)).stdout.split("\n").filter(Boolean);
    const summary = summarizeTree(tree);
    const known = new Set(tree);
    // Blobs are fetched lazily, one per file read; only a handful of small manifests are read.
    const read = async (path: string) => {
      if (!known.has(path)) return undefined;
      const out = await git(["cat-file", "-p", `HEAD:${path}`], dir).catch(() => undefined);
      return out && out.stdout.length <= MAX_READ ? out.stdout : undefined;
    };
    const volumeHints = opts.hintsFor ? await repoVolumeHints({ files: tree, ...opts.hintsFor, read }) : [];
    return { defaultBranch, branches: listed.branches, ...summary, volumeHints };
  } catch (err) {
    throw err instanceof GitProbeError ? err : probeFailure(err);
  } finally {
    await rm(home, { recursive: true, force: true }).catch(() => undefined);
  }
}
