import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { httpsRemote, GitProbeError } from "../../src/k8s/git-probe/probe.js";

describe("httpsRemote", () => {
  it("normalizes https and git@ URLs", () => {
    assert.equal(httpsRemote("https://github.com/org/app"), "https://github.com/org/app.git");
    assert.equal(httpsRemote("git@github.com:org/app.git"), "https://github.com/org/app.git");
  });

  it("embeds credentials in the URL", () => {
    const url = httpsRemote("https://github.com/org/app.git", { username: "u", token: "t" });
    assert.match(url, /^https:\/\/u:t@github\.com\/org\/app\.git$/);
  });

  it("rejects non-git URLs", () => {
    assert.throws(() => httpsRemote("ftp://example.com/x"), GitProbeError);
  });
});
