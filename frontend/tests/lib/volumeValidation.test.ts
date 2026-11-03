import { describe, expect, it } from "vitest";
import { mountPathError, volumeSizeError } from "../../src/lib/volumeValidation";

describe("volume validation", () => {
  it("rejects reserved and malformed mount paths", () => {
    for (const path of ["/", "//", "/data/", "/data/../x", "/proc/x", "/run/secrets/x", `/${"a".repeat(255)}`]) {
      expect(mountPathError(path)).toBeTruthy();
    }
    expect(mountPathError("/data")).toBeUndefined();
  });
  it("enforces whole sizes from 100Mi through 10Gi", () => {
    expect(volumeSizeError("99Mi")).toBeTruthy();
    expect(volumeSizeError("100Mi")).toBeUndefined();
    expect(volumeSizeError("10Gi")).toBeUndefined();
    expect(volumeSizeError("11Gi")).toBeTruthy();
    expect(volumeSizeError("1.5Gi")).toBeTruthy();
  });
});
