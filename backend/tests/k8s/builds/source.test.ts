import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  builtImageRef,
  InvalidBuildSourceError,
  kanikoGitContext,
  kanikoGitHostPath,
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
  it("uses git:// host/path#refs/heads/branch (HTTPS clone under the hood)", () => {
    const root = normalizeBuildSource({ repo: "https://github.com/org/app.git", branch: "main" });
    assert.equal(kanikoGitContext(root), "git://github.com/org/app.git#refs/heads/main");
    assert.equal(kanikoGitHostPath(root), "github.com/org/app.git");
  });

  it("maps scp-style SSH to host/path for Kaniko", () => {
    const source = normalizeBuildSource({ repo: "git@github.com:org/app.git", branch: "develop" });
    assert.equal(kanikoGitContext(source), "git://github.com/org/app.git#refs/heads/develop");
  });

  it("appends .git when missing", () => {
    const source = normalizeBuildSource({ repo: "https://github.com/org/app" });
    assert.equal(kanikoGitContext(source), "git://github.com/org/app.git#refs/heads/main");
  });
});

describe("builtImageRef", () => {
  it("joins registry, app, and tag", () => {
    assert.equal(builtImageRef("localhost:30500", "hello", "d12"), "localhost:30500/hello:d12");
  });
});
