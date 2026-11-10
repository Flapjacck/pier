import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "../../src/lib/id";

afterEach(() => vi.unstubAllGlobals());

describe("randomId (#83: plain-HTTP dashboards)", () => {
  it("works when randomUUID is missing, as on a non-secure origin", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(7) });
    expect(randomId()).toBe("07".repeat(16));
  });
  it("works with no Web Crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    const a = randomId();
    const b = randomId();
    expect(a).not.toBe(b);
  });
});
