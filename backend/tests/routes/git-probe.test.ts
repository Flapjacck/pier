import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { GitProbeError, type ProbeOptions } from "../../src/builds/git-probe.js";
import { gitProbeRoutesWithDeps } from "../../src/routes/git-probe.js";
import { sourceCluster, sourceK8s } from "../helpers/source-cluster.js";

async function setup(probe: (remote: string, opts?: ProbeOptions) => Promise<never> | ReturnType<typeof ok>) {
  const app = Fastify();
  await app.register(gitProbeRoutesWithDeps({ k8s: sourceK8s(sourceCluster({ credentials: ["gh"] })), namespace: "pier-system", probe: probe as never }));
  return app;
}
const ok = async () => ({ defaultBranch: "main", branches: ["main"], folders: ["."], dockerfiles: ["Dockerfile"], files: ["Dockerfile", "secret.db"], volumeHints: [] });

describe("POST /git/probe (#83)", () => {
  it("probes the normalized https URL with the picked credential and returns no file list", async () => {
    const seen: { remote: string; opts?: ProbeOptions }[] = [];
    const app = await setup(async (remote, opts) => {
      seen.push({ remote, opts });
      return ok();
    });
    const res = await app.inject({ method: "POST", url: "/git/probe", payload: { repo: "https://github.com/acme/web", gitCredential: "gh" } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { defaultBranch: "main", branches: ["main"], folders: ["."], dockerfiles: ["Dockerfile"], volumeHints: [] });
    assert.match(seen[0]?.remote ?? "", /^https:\/\/github\.com\/acme\/web/);
    assert.equal(seen[0]?.remote.includes("ghp_secret"), false);
    assert.equal(seen[0]?.opts?.auth?.token, "ghp_secret");
  });

  it("400 for a bad repo, 404 for an unknown credential, the probe's status otherwise", async () => {
    const app = await setup(async () => {
      throw new GitProbeError("Repository not found", 404);
    });
    assert.equal((await app.inject({ method: "POST", url: "/git/probe", payload: { repo: "ftp://x/y" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/git/probe", payload: { repo: "https://github.com/a/b", gitCredential: "nope" } })).statusCode, 404);
    const res = await app.inject({ method: "POST", url: "/git/probe", payload: { repo: "https://github.com/a/b" } });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error, "Repository not found");
  });
});
