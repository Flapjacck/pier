import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { builtImageRef, cloneUrl, InvalidBuildSourceError, normalizeBuildSource } from "../../src/builds/source.js";

describe("normalizeBuildSource", () => {
  it("defaults to Railpack at the repo root on main", () => {
    assert.deepEqual(normalizeBuildSource({ repo: "https://github.com/org/app" }), {
      method: "railpack",
      repo: "https://github.com/org/app",
      branch: "main",
      folder: ".",
      dockerfile: "Dockerfile",
    });
  });

  it("keeps a monorepo folder, Dockerfile path and credential name", () => {
    const source = normalizeBuildSource({
      method: "dockerfile",
      repo: "https://github.com/org/mono.git",
      branch: "release/1.2",
      folder: "apps/api/",
      dockerfile: "docker/Dockerfile.prod",
      gitCredential: "work",
    });
    assert.equal(source.folder, "apps/api");
    assert.equal(source.dockerfile, "docker/Dockerfile.prod");
    assert.equal(source.gitCredential, "work");
  });

  for (const [label, input] of [
    ["folder traversal", { repo: "https://x.com/a/b", folder: "../x" }],
    ["absolute Dockerfile", { repo: "https://x.com/a/b", dockerfile: "/etc/passwd" }],
    ["ftp scheme", { repo: "ftp://x.com/a/b" }],
    ["plain http", { repo: "http://x.com/a/b" }],
    ["token in the URL", { repo: "https://user:ghp_secret@github.com/a/b" }],
    ["branch that looks like an option", { repo: "https://x.com/a/b", branch: "-upload-pack=evil" }],
    ["branch with ..", { repo: "https://x.com/a/b", branch: "a..b" }],
    ["bad credential name", { repo: "https://x.com/a/b", gitCredential: "Bad_Name" }],
  ] as const) {
    it(`rejects ${label}`, () => {
      assert.throws(() => normalizeBuildSource(input), InvalidBuildSourceError);
    });
  }
});

describe("cloneUrl", () => {
  it("rewrites SSH forms to HTTPS and adds .git", () => {
    assert.equal(cloneUrl("git@github.com:org/app.git"), "https://github.com/org/app.git");
    assert.equal(cloneUrl("ssh://git@github.com/org/app"), "https://github.com/org/app.git");
    assert.equal(cloneUrl("https://github.com/org/app/"), "https://github.com/org/app.git");
  });
});

describe("builtImageRef", () => {
  it("joins registry, app and tag", () => {
    assert.equal(builtImageRef("localhost:30500", "hello", "d12-abc1234"), "localhost:30500/hello:d12-abc1234");
  });
});
