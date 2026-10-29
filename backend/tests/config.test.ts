import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("uses defaults when env is empty", () => {
    const config = loadConfig({});
    assert.equal(config.port, 3000);
    assert.equal(config.host, "0.0.0.0");
    assert.equal(config.namespace, "pier-apps");
    assert.equal(config.kubeconfig, undefined);
  });

  it("parses a valid PORT", () => {
    const config = loadConfig({ PORT: "8080" });
    assert.equal(config.port, 8080);
  });

  it("respects PIER_NAMESPACE", () => {
    const config = loadConfig({ PIER_NAMESPACE: "staging" });
    assert.equal(config.namespace, "staging");
  });

  it("treats empty KUBECONFIG as undefined", () => {
    const config = loadConfig({ KUBECONFIG: "  " });
    assert.equal(config.kubeconfig, undefined);
  });

  for (const port of ["abc", "0", "70000"]) {
    it(`rejects invalid PORT=${port}`, () => {
      assert.throws(
        () => loadConfig({ PORT: port }),
        (err: Error) => {
          assert.match(err.message, /PORT/);
          return true;
        },
      );
    });
  }
});
