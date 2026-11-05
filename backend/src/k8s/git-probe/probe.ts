import { execFile } from "node:child_process";
import { mkdtemp, rm, readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { constants } from "node:fs";

const execFileAsync = promisify(execFile);

export type GitProbeResult = {
  defaultBranch: string;
  branches: string[];
  folders: string[];
};

export class GitProbeError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 502 = 502,
  ) {
    super(message);
    this.name = "GitProbeError";
  }
}

/** Turn https:// or git@ URLs into an https remote git understands. */
export function httpsRemote(repo: string, auth?: { username: string; token: string }): string {
  let url = repo.trim();
  const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/i.exec(url);
  if (ssh) url = `https://${ssh[1]}/${ssh[2].replace(/\.git$/i, "")}.git`;
  else if (!url.endsWith(".git") && /^https?:\/\//i.test(url)) url = `${url.replace(/\/$/, "")}.git`;

  if (!/^https:\/\//i.test(url)) {
    throw new GitProbeError("Use an https:// or git@ URL", 400);
  }
  if (!auth) return url;
  const u = new URL(url);
  u.username = encodeURIComponent(auth.username);
  u.password = encodeURIComponent(auth.token);
  return u.toString();
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url;
  }
}

async function lsRemoteHeads(remote: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-remote", "--heads", "--quiet", remote],
      { timeout: 25_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" } },
    );
    const branches: string[] = [];
    for (const line of stdout.split("\n")) {
      const m = /refs\/heads\/(.+)$/.exec(line.trim());
      if (m?.[1]) branches.push(m[1]);
    }
    return branches.sort((a, b) => a.localeCompare(b));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|Repository not found|fatal: /i.test(msg)) {
      throw new GitProbeError("Repository not found or not accessible", 404);
    }
    throw new GitProbeError(`Could not list branches (${redact(remote)})`, 502);
  }
}

async function listFolders(remote: string, branch: string): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "pier-git-probe-"));
  try {
    await execFileAsync(
      "git",
      ["clone", "--depth", "1", "--branch", branch, "--single-branch", remote, dir],
      { timeout: 45_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" } },
    );
    const folders = new Set<string>(["."]);
    async function walk(rel: string, depth: number): Promise<void> {
      if (depth > 2) return;
      const abs = rel === "." ? dir : join(dir, rel);
      let entries;
      try {
        entries = await readdir(abs, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === ".git") continue;
        const next = rel === "." ? entry.name : `${rel}/${entry.name}`;
        folders.add(next);
        await walk(next, depth + 1);
      }
    }
    await walk(".", 0);
    // Prefer folders that contain a Dockerfile at their root.
    const withDocker: string[] = [];
    for (const folder of folders) {
      const dockerPath = folder === "." ? join(dir, "Dockerfile") : join(dir, folder, "Dockerfile");
      try {
        await access(dockerPath, constants.R_OK);
        withDocker.push(folder);
      } catch {
        /* ignore */
      }
    }
    const ordered = [
      ...withDocker.sort((a, b) => a.localeCompare(b)),
      ...[...folders].filter((f) => !withDocker.includes(f)).sort((a, b) => a.localeCompare(b)),
    ];
    return ordered;
  } catch (err) {
    if (err instanceof GitProbeError) throw err;
    // Branch list succeeded; folders are best-effort.
    return ["."];
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function probeGitRepo(
  repo: string,
  auth?: { username: string; token: string },
): Promise<GitProbeResult> {
  const remote = httpsRemote(repo, auth);
  const branches = await lsRemoteHeads(remote);
  if (branches.length === 0) throw new GitProbeError("No branches found", 404);
  const defaultBranch = branches.includes("main") ? "main" : branches.includes("master") ? "master" : branches[0]!;
  const folders = await listFolders(remote, defaultBranch);
  return { defaultBranch, branches, folders };
}
