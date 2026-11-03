import { describe, expect, it } from "vitest";
import { deleteVolumesWarning } from "../../src/lib/deleteResult";

describe("deleteVolumesWarning", () => {
  it("is undefined for a clean delete", () => {
    expect(deleteVolumesWarning({ ok: true, dataRetained: false, volumeErrors: [] })).toBeUndefined();
  });
  it("lists volume errors first", () => {
    expect(deleteVolumesWarning({ ok: true, dataRetained: true, volumeErrors: ["a: boom", "b: nope"] })).toBe("a: boom; b: nope");
  });
  it("explains retained data", () => {
    expect(deleteVolumesWarning({ ok: true, dataRetained: true, volumeErrors: [] })).toMatch(/kept on the node/);
  });
});
