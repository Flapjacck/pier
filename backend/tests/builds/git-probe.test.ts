import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { gitArgs, parseLsRemote, probeFailure, probeGitRepo, summarizeTree } from "../../src/builds/git-probe.js";

/** The wizard's repo probe (#83), against a real local repo over file://. */

let dir = "";
const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: join(dir, "src"), stdio: "pipe" });

before(() => {
  dir = mkdtempSync(join(tmpdir(), "pier-probe-test-"));
  const src = join(dir, "src");
  mkdirSync(join(src, "apps/api"), { recursive: true });
  mkdirSync(join(src, "node_modules/x"), { recursive: true });
  writeFileSync(join(src, "apps/api/Dockerfile"), "FROM node\n");
  writeFileSync(join(src, "web.Dockerfile"), "FROM nginx\n");
  writeFileSync(join(src, "package.json"), "{}\n");
  writeFileSync(join(src, "apps/api/package.json"), '{"dependencies":{"sqlite3":"^5","fastify":"^5"}}\n');
  execFileSync("git", ["init", "-q", "-b", "trunk", src]);
  git("add", "-A");
  git("commit", "-qm", "init");
  git("branch", "feature");
  execFileSync("git", ["clone", "-q", "--bare", src, join(dir, "remote.git")]);
});
after(() => rmSync(dir, { recursive: true, force: true }));

describe("git probe (#83)", () => {
  it("reads the real default branch, branches, folders and Dockerfiles without a checkout", async () => {
    const result = await probeGitRepo(`file://${join(dir, "remote.git")}`, { protocols: "file" });
    assert.equal(result.defaultBranch, "trunk");
    assert.deepEqual(result.branches, ["feature", "trunk"]);
    assert.deepEqual(result.folders, [".", "apps", "apps/api"]);
    assert.deepEqual(result.dockerfiles, ["apps/api/Dockerfile", "web.Dockerfile"]);
    assert.ok(result.files.includes("package.json"));
  });

  it("reads volume hints for the picked folder and branch", async () => {
    const remote = `file://${join(dir, "remote.git")}`;
    const result = await probeGitRepo(remote, { protocols: "file", branch: "feature", hintsFor: { folder: "apps/api", method: "railpack" } });
    assert.deepEqual(result.volumeHints.map((h) => h.path), ["/app/data"]);
    await assert.rejects(probeGitRepo(remote, { protocols: "file", branch: "nope" }), /doesn't exist/);
  });

  it("refuses protocols that aren't allowed (https only in production)", async () => {
    await assert.rejects(probeGitRepo(`file://${join(dir, "remote.git")}`), (err: Error) => err.name === "GitProbeError");
  });

  it("passes a token through env, never git's arguments", async () => {
    const result = await probeGitRepo(`file://${join(dir, "remote.git")}`, { protocols: "file", auth: { username: "u", token: "ghp_should_not_leak" } });
    assert.equal(result.defaultBranch, "trunk");
    // The helper reads $GIT_PASSWORD when git asks; argv only names the variable.
    const argv = gitArgs(["ls-remote", "--", "https://github.com/a/b.git"], true).join(" ");
    assert.match(argv, /\$GIT_PASSWORD/);
    assert.equal(argv.includes("ghp_"), false);
  });

  it("parses ls-remote and maps failures to plain reasons", () => {
    const sha = "a".repeat(40);
    assert.deepEqual(parseLsRemote(`ref: refs/heads/main\tHEAD\n${sha}\tHEAD\n${sha}\trefs/heads/main\n${sha}\trefs/heads/dev\n`), { defaultBranch: "main", branches: ["dev", "main"] });
    assert.equal(probeFailure(Object.assign(new Error("x"), { stderr: "fatal: could not read Username for 'https://github.com': terminal prompts disabled" })).status, 404);
    assert.equal(probeFailure(Object.assign(new Error("x"), { stderr: "Could not resolve host: github.com" })).status, 502);
    const leak = probeFailure(Object.assign(new Error("fatal: https://u:tok@host/x"), { stderr: "" }));
    assert.equal(leak.message.includes("tok"), false);
  });

  it("caps depth and skips dot and node_modules folders", () => {
    const tree = summarizeTree(["a/b/c/d/e.txt", ".github/workflows/ci.yml", "node_modules/x/i.js", "Dockerfile.prod"]);
    assert.deepEqual(tree.folders, [".", "a", "a/b", "a/b/c"]);
    assert.deepEqual(tree.dockerfiles, ["Dockerfile.prod"]);
  });
});
