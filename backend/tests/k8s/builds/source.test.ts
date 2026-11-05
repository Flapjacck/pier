import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  builtImageRef,
  cloneRepoUrl,
  InvalidBuildSourceError,
  kanikoBuildContext,
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

describe("kanikoBuildContext", () => {
  it("points at /workspace/src for root and subfolder", () => {
    const root = normalizeBuildSource({ repo: "https://github.com/org/app.git", branch: "main" });
    assert.equal(kanikoBuildContext(root), "dir:///workspace/src");
    const sub = normalizeBuildSource({ repo: "https://github.com/org/app.git", folder: "apps/web" });
    assert.equal(kanikoBuildContext(sub), "dir:///workspace/src/apps/web");
  });
});

describe("cloneRepoUrl", () => {
  it("appends .git to HTTPS URLs when missing", () => {
    const source = normalizeBuildSource({ repo: "https://github.com/org/app" });
    assert.equal(cloneRepoUrl(source), "https://github.com/org/app.git");
  });

  it("keeps scp-style SSH URLs", () => {
    const source = normalizeBuildSource({ repo: "git@github.com:org/app.git" });
    assert.equal(cloneRepoUrl(source), "git@github.com:org/app.git");
  });
});

describe("builtImageRef", () => {
  it("joins registry, app, and tag", () => {
    assert.equal(builtImageRef("localhost:30500", "hello", "d12"), "localhost:30500/hello:d12");
  });
});
