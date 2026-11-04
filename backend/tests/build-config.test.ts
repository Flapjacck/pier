import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

type PackageJson = {
  engines?: { node?: string };
  tsup?: { removeNodeProtocol?: boolean; target?: string };
};

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PackageJson;

describe("build config (#80)", () => {
  it("keeps the node: prefix so the bundle imports node:sqlite, which has no bare alias", () => {
    // tsup strips node: by default, which turns node:sqlite into the npm name "sqlite".
    assert.equal(pkg.tsup?.removeNodeProtocol, false);
  });

  it("requires a Node version with an unflagged node:sqlite", () => {
    assert.equal(pkg.engines?.node, ">=22.13");
  });
});
