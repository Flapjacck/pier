import { describe, it, expect } from "vitest";
import { parseAppEventList, parseAppPod } from "../../src/api/guards";
import { parseSessionInfo } from "../../src/api/guards";

describe("parseSessionInfo", () => {
  it("parses ingressDomain and tls", () => {
    expect(
      parseSessionInfo({ ok: true, authDisabled: false, ingressDomain: "192.0.2.10.nip.io", tls: true }),
    ).toEqual({ ok: true, authDisabled: false, ingressDomain: "192.0.2.10.nip.io", tls: true });
  });

  describe("pod and event guards", () => {
    it("keeps pod image and last exit details", () => {
      expect(parseAppPod({
        name: "web-1", phase: "Failed", ready: false, readyContainers: "0/1", restarts: 2,
        image: "example/web:1", lastExitCode: 137, lastTerminationReason: "OOMKilled",
      })).toMatchObject({ image: "example/web:1", lastExitCode: 137, lastTerminationReason: "OOMKilled" });
    });

    it("parses events and rejects malformed entries", () => {
      expect(parseAppEventList({ events: [{
        type: "Warning", reason: "BackOff", message: "retrying", object: { kind: "Pod", name: "web-1" }, count: 3,
      }] })).toEqual({ events: [{
        type: "Warning", reason: "BackOff", message: "retrying", object: { kind: "Pod", name: "web-1" }, count: 3,
      }] });
      expect(() => parseAppEventList({ events: [{ reason: "BackOff" }] })).toThrow(SyntaxError);
    });
  });

  it("defaults ingressDomain to null and tls to false when an older backend omits them", () => {
    expect(parseSessionInfo({ ok: true, authDisabled: true })).toEqual({
      ok: true,
      authDisabled: true,
      ingressDomain: null,
      tls: false,
    });
  });

  it("treats a non-boolean tls as false", () => {
    expect(parseSessionInfo({ ok: true, authDisabled: false, tls: "yes" }).tls).toBe(false);
  });

  it("rejects a malformed session", () => {
    expect(() => parseSessionInfo({ ok: true })).toThrow(SyntaxError);
  });
});
