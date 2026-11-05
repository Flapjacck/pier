import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  builtImageRef,
  InvalidBuildSourceError,
  kanikoGitContext,
  normalizeBuildSource,
} from "../../../src/k8s/builds/source.js";

describe("normalizeBuildSource", () => {
  it("fills defaults for a public HTTPS repo", () => {
    const source = normalizeBuildSource({ repo: "https://github.com/org/app.git" });
    assert.deepEqual(source, {
      repo: "https://github.com/org/app.git",
      branch: "main",
      folder: ".",
      dockerfile: "Dockerfile",
    });
  });

  it("accepts a subfolder Dockerfile and git credential", () => {
    const source = normalizeBuildSource({
      repo: "https://github.com/org/mono.git",
      branch: "develop",
      folder: "apps/api",
      dockerfile: "Dockerfile.prod",
      gitCredential: "work",
    });
    assert.equal(source.folder, "apps/api");
    assert.equal(source.dockerfile, "Dockerfile.prod");
    assert.equal(source.gitCredential, "work");
  });

  it("rejects path traversal and bad schemes", () => {
    assert.throws(() => normalizeBuildSource({ repo: "https://x.com/a", folder: "../x" }), InvalidBuildSourceError);
    assert.throws(() => normalizeBuildSource({ repo: "ftp://x.com/a" }), InvalidBuildSourceError);
    assert.throws(() => normalizeBuildSource({ repo: "https://x.com/a", dockerfile: "/etc/passwd" }), InvalidBuildSourceError);
  });
});

describe("kanikoGitContext", () => {
  it("builds context for repo root and subfolder", () => {
    const root = normalizeBuildSource({ repo: "https://github.com/org/app.git", branch: "main" });
    assert.equal(kanikoGitContext(root), "git://github.com/org/app.git#refs/heads/main");
    const sub = normalizeBuildSource({ repo: "https://github.com/org/app.git", folder: "apps/web" });
    assert.equal(kanikoGitContext(sub), "git://github.com/org/app.git#refs/heads/main#apps/web");
  });

  it("rewrites SSH URLs", () => {
    const source = normalizeBuildSource({ repo: "git@github.com:org/app.git" });
    assert.equal(kanikoGitContext(source), "git://github.com/org/app.git#refs/heads/main");
  });
});

describe("builtImageRef", () => {
  it("joins registry, app, and tag", () => {
    assert.equal(builtImageRef("localhost:30500", "hello", "d12"), "localhost:30500/hello:d12");
  });
});
