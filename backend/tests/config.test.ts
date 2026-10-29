import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("uses defaults when env is empty", () => {
    const config = loadConfig({});
    assert.equal(config.port, 3000);
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.namespace, "pier-apps");
    assert.equal(config.kubeconfig, undefined);
    assert.equal(config.apiToken, undefined);
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

  it("treats empty PIER_API_TOKEN as undefined", () => {
    const config = loadConfig({ PIER_API_TOKEN: "  " });
    assert.equal(config.apiToken, undefined);
  });

  it("parses a valid PIER_API_TOKEN", () => {
    const config = loadConfig({ PIER_API_TOKEN: "secret-token-123" });
    assert.equal(config.apiToken, "secret-token-123");
  });

  it("allows non-loopback HOST with a token", () => {
    const config = loadConfig({
      HOST: "0.0.0.0",
      PIER_API_TOKEN: "secret-token",
    });
    assert.equal(config.host, "0.0.0.0");
    assert.equal(config.apiToken, "secret-token");
  });

  it("refuses non-loopback HOST without a token", () => {
    assert.throws(
      () => loadConfig({ HOST: "0.0.0.0" }),
      (err: Error) => {
        assert.match(err.message, /Refusing to listen on 0.0.0.0/);
        return true;
      },
    );
  });

  it("allows loopback 127.0.0.1 without a token", () => {
    const config = loadConfig({ HOST: "127.0.0.1" });
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.apiToken, undefined);
  });

  it("allows loopback ::1 without a token", () => {
    const config = loadConfig({ HOST: "::1" });
    assert.equal(config.host, "::1");
    assert.equal(config.apiToken, undefined);
  });

  it("allows localhost without a token", () => {
    const config = loadConfig({ HOST: "localhost" });
    assert.equal(config.host, "localhost");
    assert.equal(config.apiToken, undefined);
  });
});
