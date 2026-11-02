import { describe, it, expect } from "vitest";
import { parseSessionInfo } from "../../src/api/guards";

describe("parseSessionInfo", () => {
  it("parses ingressDomain and tls", () => {
    expect(
      parseSessionInfo({ ok: true, authDisabled: false, ingressDomain: "192.0.2.10.nip.io", tls: true }),
    ).toEqual({ ok: true, authDisabled: false, ingressDomain: "192.0.2.10.nip.io", tls: true });
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
