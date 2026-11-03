import { describe, it, expect } from "vitest";
import { envToRows, sameEnv, validateEnvRows } from "../../src/lib/envValidation";

describe("validateEnvRows", () => {
  it("builds the env map and skips blank rows", () => {
    const result = validateEnvRows([
      { id: "1", key: " A ", value: " 1 " },
      { id: "2", key: "", value: "" },
    ]);
    expect(result).toEqual({ env: { A: "1" }, errors: {} });
  });

  it("flags bad and duplicate keys by row id", () => {
    const result = validateEnvRows([
      { id: "1", key: "1BAD", value: "x" },
      { id: "2", key: "A", value: "x" },
      { id: "3", key: "A", value: "y" },
    ]);
    expect(Object.keys(result.errors)).toEqual(["1", "3"]);
  });

  it("caps the list at 50", () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: String(i), key: `K${i}`, value: "v" }));
    expect(validateEnvRows(rows).errors).toEqual({ "": "Maximum 50 environment variables" });
  });
});

describe("envToRows / sameEnv", () => {
  it("adds one blank row to type into", () => {
    expect(envToRows({ A: "1" })).toEqual([
      { id: "1", key: "A", value: "1" },
      { id: "2", key: "", value: "" },
    ]);
    expect(envToRows(undefined)).toEqual([{ id: "1", key: "", value: "" }]);
  });

  it("compares maps by content", () => {
    expect(sameEnv({ A: "1", B: "2" }, { B: "2", A: "1" })).toBe(true);
    expect(sameEnv({ A: "1" }, { A: "2" })).toBe(false);
    expect(sameEnv({ A: "1" }, {})).toBe(false);
  });
});
